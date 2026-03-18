import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/upsert-admin.mjs <adminEmail> <adminPassword>");
  process.exit(1);
}

await mongoose.connect("mongodb://127.0.0.1:27017/campus_rider");

const users = mongoose.connection.db.collection("users");
const now = new Date();
const passwordHash = await bcrypt.hash(password, 10);
const existing = await users.findOne({ email });

if (existing) {
  await users.updateOne(
    { _id: existing._id },
    {
      $set: {
        name: "Smoke Admin",
        email,
        role: "admin",
        passwordHash,
        isActive: true,
        isOnline: false,
        driverApprovalStatus: "approved",
        updatedAt: now,
      },
    },
  );
} else {
  await users.insertOne({
    name: "Smoke Admin",
    email,
    role: "admin",
    passwordHash,
    isActive: true,
    isOnline: false,
    driverApprovalStatus: "approved",
    createdAt: now,
    updatedAt: now,
  });
}

console.log(`AdminReady=${email}`);
await mongoose.disconnect();
