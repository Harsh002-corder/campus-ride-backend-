import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!env.emailUser || !env.emailPass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.emailUser,
      pass: env.emailPass,
    },
  });

  return transporter;
}

export async function sendSignupOtpEmail({ to, name, otp, expiresMinutes }) {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, reason: "Email credentials are not configured" };
  }

  await transport.sendMail({
    from: env.emailFrom || env.emailUser,
    to,
    subject: "CampusRide OTP Verification",
    text: `Hi ${name || "there"},\n\nYour CampusRide OTP is: ${otp}\nIt expires in ${expiresMinutes} minutes.\n\nIf you did not request this, please ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">\n      <p>Hi ${name || "there"},</p>\n      <p>Your CampusRide OTP is:</p>\n      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>\n      <p>This OTP expires in ${expiresMinutes} minutes.</p>\n      <p>If you did not request this, please ignore this email.</p>\n    </div>`,
  });

  return { sent: true };
}

export async function sendPasswordResetOtpEmail({ to, name, otp, expiresMinutes }) {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, reason: "Email credentials are not configured" };
  }

  await transport.sendMail({
    from: env.emailFrom || env.emailUser,
    to,
    subject: "CampusRide Password Reset OTP",
    text: `Hi ${name || "there"},\n\nUse this OTP to reset your CampusRide password: ${otp}\nIt expires in ${expiresMinutes} minutes.\n\nIf you did not request this, please ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">\n      <p>Hi ${name || "there"},</p>\n      <p>Use this OTP to reset your CampusRide password:</p>\n      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>\n      <p>This OTP expires in ${expiresMinutes} minutes.</p>\n      <p>If you did not request this, please ignore this email.</p>\n    </div>`,
  });

  return { sent: true };
}

export async function sendAccountStatusEmail({ to, name, title, message, details }) {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, reason: "Email credentials are not configured" };
  }

  const detailsBlock = Array.isArray(details) && details.length > 0
    ? `\n\nDetails:\n- ${details.join("\n- ")}`
    : "";

  const detailsHtml = Array.isArray(details) && details.length > 0
    ? `<ul>${details.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : "";

  await transport.sendMail({
    from: env.emailFrom || env.emailUser,
    to,
    subject: title || "CampusRide Account Update",
    text: `Hi ${name || "there"},\n\n${message || "Your account status has been updated by CampusRide admin."}${detailsBlock}\n\nIf you believe this is incorrect, contact support.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>Hi ${name || "there"},</p>
      <p>${message || "Your account status has been updated by CampusRide admin."}</p>
      ${detailsHtml}
      <p>If you believe this is incorrect, contact support.</p>
    </div>`,
  });

  return { sent: true };
}

export async function sendAccountDeletedEmail({ to, name }) {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, reason: "Email credentials are not configured" };
  }

  await transport.sendMail({
    from: env.emailFrom || env.emailUser,
    to,
    subject: "CampusRide Account Deleted",
    text: `Hi ${name || "there"},\n\nYour CampusRide account has been deleted by an administrator.\nIf this was not expected, please contact support immediately.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>Hi ${name || "there"},</p>
      <p>Your CampusRide account has been deleted by an administrator.</p>
      <p>If this was not expected, please contact support immediately.</p>
    </div>`,
  });

  return { sent: true };
}

export async function sendRideInvoiceEmail({ to, name, rideId, fare, pickup, drop, createdAt, completedAt, pdfBuffer }) {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, reason: "Email credentials are not configured" };
  }

  const subject = `CampusRide Receipt • Ride ${rideId}`;
  const safeFare = Number(fare || 0).toFixed(2);

  await transport.sendMail({
    from: env.emailFrom || env.emailUser,
    to,
    subject,
    text: `Hi ${name || "there"},\n\nYour ride is complete.\nRide ID: ${rideId}\nRoute: ${pickup || "—"} -> ${drop || "—"}\nFare: INR ${safeFare}\nRequested: ${createdAt || "—"}\nCompleted: ${completedAt || "—"}\n\nYour PDF invoice is attached.`,
    html: `<div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
      <h2 style="margin:0 0 8px">CampusRide Receipt</h2>
      <p style="margin:0 0 16px">Hi ${name || "there"}, your ride is complete.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;border:1px solid #ddd">
        <tr><td style="border:1px solid #ddd"><strong>Ride ID</strong></td><td style="border:1px solid #ddd">${rideId}</td></tr>
        <tr><td style="border:1px solid #ddd"><strong>Route</strong></td><td style="border:1px solid #ddd">${pickup || "—"} → ${drop || "—"}</td></tr>
        <tr><td style="border:1px solid #ddd"><strong>Total Fare</strong></td><td style="border:1px solid #ddd">INR ${safeFare}</td></tr>
        <tr><td style="border:1px solid #ddd"><strong>Requested</strong></td><td style="border:1px solid #ddd">${createdAt || "—"}</td></tr>
        <tr><td style="border:1px solid #ddd"><strong>Completed</strong></td><td style="border:1px solid #ddd">${completedAt || "—"}</td></tr>
      </table>
      <p style="margin-top:14px">Your detailed PDF invoice is attached to this email.</p>
    </div>`,
    attachments: pdfBuffer
      ? [{
        filename: `campusride-invoice-${rideId}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      }]
      : [],
  });

  return { sent: true };
}
