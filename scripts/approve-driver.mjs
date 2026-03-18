import mongoose from "mongoose";

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/approve-driver.mjs <driverEmail>");
  process.exit(1);
}

await mongoose.connect("mongodb://127.0.0.1:27017/campus_rider");

await mongoose.connection.db.collection("users").updateOne(
  { email },
  {
    $set: {
      driverApprovalStatus: "approved",
      isOnline: true,
      updatedAt: new Date(),
    },
  },
);

console.log(`DriverApproved=${email}`);
await mongoose.disconnect();
