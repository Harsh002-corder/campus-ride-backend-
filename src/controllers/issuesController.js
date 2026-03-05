import mongoose from "mongoose";
import { z } from "zod";
import { Issue, Ride } from "../models/index.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { emitAdminIssueCreated, emitAdminIssueUpdated } from "../services/socket.js";
import { createNotification, createRoleNotifications } from "../services/notificationService.js";

const ISSUE_CATEGORIES = ["overcharge", "driver_behavior", "route_issue", "safety", "app_issue", "other"];
const ISSUE_STATUSES = ["open", "in_review", "resolved", "rejected"];

export const createIssueSchema = z.object({
  rideId: z.string().min(1),
  category: z.enum(ISSUE_CATEGORIES),
  description: z.string().trim().min(8).max(600),
});

export const updateIssueSchema = z.object({
  status: z.enum(ISSUE_STATUSES.filter((status) => status !== "open")),
  resolutionNote: z.string().trim().max(600).optional(),
});

export const createIssue = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.STUDENT) {
    throw new AppError(403, "Only students can create post-ride issues");
  }

  if (!mongoose.Types.ObjectId.isValid(req.body.rideId)) {
    throw new AppError(400, "Invalid ride ID");
  }

  const rideId = new mongoose.Types.ObjectId(req.body.rideId);
  const studentId = new mongoose.Types.ObjectId(req.user.id);

  const ride = await Ride.findOne({
    _id: rideId,
    studentId,
    status: { $in: ["completed", "cancelled"] },
  }).lean();

  if (!ride) {
    throw new AppError(404, "Ride not found or not eligible for issue reporting");
  }

  const now = new Date();
  const issue = await Issue.create({
    rideId,
    reporterId: studentId,
    reporterRole: ROLES.STUDENT,
    category: req.body.category,
    description: req.body.description,
    status: "open",
    resolutionNote: "",
    assignedAdminId: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const populated = await Issue.findById(issue._id)
    .populate("rideId", "pickup drop status createdAt")
    .populate("reporterId", "name email")
    .lean();
  const serialized = serializeIssue(populated);
  emitAdminIssueCreated(serialized);

  await createRoleNotifications({
    role: ROLES.ADMIN,
    type: "issue_created",
    title: "New support issue",
    body: `${serialized.reporter?.name || "A user"} reported a ${serialized.category.replace("_", " ")} issue.`,
    data: { issueId: serialized.id, category: serialized.category, status: serialized.status },
  });

  res.status(201).json({ issue: serialized });
});

export const listMyIssues = asyncHandler(async (req, res) => {
  const issues = await Issue.find({ reporterId: new mongoose.Types.ObjectId(req.user.id) })
    .populate("rideId", "pickup drop status createdAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({ issues: issues.map(serializeIssue) });
});

export const listAdminIssues = asyncHandler(async (req, res) => {
  const status = String(req.query.status || "").trim();
  const category = String(req.query.category || "").trim();
  const search = String(req.query.search || "").trim();

  const query = {};
  if (ISSUE_STATUSES.includes(status)) {
    query.status = status;
  }
  if (ISSUE_CATEGORIES.includes(category)) {
    query.category = category;
  }

  const issues = await Issue.find(query)
    .populate("rideId", "pickup drop status createdAt")
    .populate("reporterId", "name email role")
    .populate("assignedAdminId", "name email")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const serialized = issues.map(serializeIssue).filter((issue) => {
    if (!search) return true;
    const haystack = `${issue.id} ${issue.category} ${issue.description} ${issue.reporter?.name || ""} ${issue.reporter?.email || ""} ${issue.ride?.pickup?.label || ""} ${issue.ride?.drop?.label || ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  res.json({ issues: serialized });
});

export const updateIssueStatus = asyncHandler(async (req, res) => {
  const issueId = req.params.issueId;
  if (!mongoose.Types.ObjectId.isValid(issueId)) {
    throw new AppError(400, "Invalid issue ID");
  }

  const existingIssue = await Issue.findById(new mongoose.Types.ObjectId(issueId)).lean();
  if (!existingIssue) {
    throw new AppError(404, "Issue not found");
  }

  const now = new Date();
  const updatedIssue = await Issue.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(issueId) },
    {
      $set: {
        status: req.body.status,
        resolutionNote: req.body.resolutionNote?.trim() || "",
        assignedAdminId: new mongoose.Types.ObjectId(req.user.id),
        reviewedAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  const populated = await Issue.findById(updatedIssue._id)
    .populate("rideId", "pickup drop status createdAt")
    .populate("reporterId", "name email role")
    .populate("assignedAdminId", "name email")
    .lean();
  const serialized = serializeIssue(populated);
  emitAdminIssueUpdated({ issue: serialized, previousStatus: existingIssue.status || null });

  if (serialized.reporter?.id) {
    await createNotification({
      userId: serialized.reporter.id,
      type: "issue_status",
      title: "Issue status updated",
      body: `Your issue is now ${serialized.status.replace("_", " ")}.`,
      data: { issueId: serialized.id, status: serialized.status },
    });
  }

  await createRoleNotifications({
    role: ROLES.ADMIN,
    type: "issue_updated",
    title: "Issue updated",
    body: `Issue ${serialized.id.slice(-6)} moved to ${serialized.status.replace("_", " ")}.`,
    data: { issueId: serialized.id, status: serialized.status },
  });

  res.json({ issue: serialized });
});

function serializeIssue(issue) {
  if (!issue) return null;

  const ride = issue.rideId && typeof issue.rideId === "object" && issue.rideId._id
    ? {
      id: issue.rideId._id.toString(),
      pickup: issue.rideId.pickup || null,
      drop: issue.rideId.drop || null,
      status: issue.rideId.status || null,
      createdAt: issue.rideId.createdAt || null,
    }
    : issue.rideId
      ? { id: issue.rideId.toString() }
      : null;

  const reporter = issue.reporterId && typeof issue.reporterId === "object" && issue.reporterId._id
    ? {
      id: issue.reporterId._id.toString(),
      name: issue.reporterId.name || "User",
      email: issue.reporterId.email || null,
      role: issue.reporterId.role || null,
    }
    : issue.reporterId
      ? { id: issue.reporterId.toString() }
      : null;

  const assignedAdmin = issue.assignedAdminId && typeof issue.assignedAdminId === "object" && issue.assignedAdminId._id
    ? {
      id: issue.assignedAdminId._id.toString(),
      name: issue.assignedAdminId.name || "Admin",
      email: issue.assignedAdminId.email || null,
    }
    : issue.assignedAdminId
      ? { id: issue.assignedAdminId.toString() }
      : null;

  return {
    id: issue._id.toString(),
    ride,
    reporter,
    reporterRole: issue.reporterRole || null,
    category: issue.category,
    description: issue.description,
    status: issue.status,
    resolutionNote: issue.resolutionNote || "",
    assignedAdmin,
    reviewedAt: issue.reviewedAt || null,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}
