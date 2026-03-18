import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/upsert-super-admin.mjs <email> <password>");
  process.exit(1);
}

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/campus_rider";
await mongoose.connect(mongoUri);

const users = mongoose.connection.db.collection("users");
const now = new Date();
const passwordHash = await bcrypt.hash(password, 10);
const normalizedEmail = String(email).trim().toLowerCase();

const existing = await users.findOne({ email: normalizedEmail });

const payload = {
  name: "Super Admin",
  email: normalizedEmail,
  role: "super_admin",
  passwordHash,
  isActive: true,
  isOnline: false,
  driverApprovalStatus: "approved",
  driverVerificationStatus: "approved",
  updatedAt: now,
};

if (existing) {
  await users.updateOne({ _id: existing._id }, { $set: payload });
} else {
  await users.insertOne({
    ...payload,
    createdAt: now,
  });
}

console.log(`SuperAdminReady=${normalizedEmail}`);
await mongoose.disconnect();
