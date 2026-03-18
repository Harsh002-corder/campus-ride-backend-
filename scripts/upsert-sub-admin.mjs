import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const email = process.argv[2];
const password = process.argv[3];
const collegeRef = process.argv[4] || null;

if (!email || !password) {
  console.error("Usage: node scripts/upsert-sub-admin.mjs <email> <password> [collegeCodeOrId]");
  process.exit(1);
}

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/campus_rider";
await mongoose.connect(mongoUri);

const users = mongoose.connection.db.collection("users");
const colleges = mongoose.connection.db.collection("colleges");
const now = new Date();
const normalizedEmail = String(email).trim().toLowerCase();
const passwordHash = await bcrypt.hash(password, 10);

let college = null;
if (collegeRef) {
  if (mongoose.Types.ObjectId.isValid(collegeRef)) {
    college = await colleges.findOne({ _id: new mongoose.Types.ObjectId(collegeRef) });
  }

  if (!college) {
    college = await colleges.findOne({ code: String(collegeRef).trim().toUpperCase() });
  }

  if (!college) {
    console.error(`College not found for reference: ${collegeRef}`);
    process.exit(1);
  }
}

const existing = await users.findOne({ email: normalizedEmail });

const payload = {
  name: "Sub Admin",
  email: normalizedEmail,
  role: "sub_admin",
  passwordHash,
  collegeId: college?._id || null,
  isActive: true,
  isOnline: false,
  driverApprovalStatus: "approved",
  driverVerificationStatus: "approved",
  updatedAt: now,
};

let subAdminId = null;
if (existing) {
  subAdminId = existing._id;
  await users.updateOne({ _id: existing._id }, { $set: payload });
} else {
  const inserted = await users.insertOne({
    ...payload,
    createdAt: now,
  });
  subAdminId = inserted.insertedId;
}

if (college?._id && subAdminId) {
  await colleges.updateOne(
    { _id: college._id },
    {
      $set: {
        subAdminId,
        updatedAt: now,
      },
    },
  );
}

console.log(`SubAdminReady=${normalizedEmail}`);
if (college?._id) {
  console.log(`AssignedCollege=${college.code || college._id.toString()}`);
}

await mongoose.disconnect();
