import mongoose from "mongoose";

await mongoose.connect("mongodb://127.0.0.1:27017/campus_rider");

const settings = mongoose.connection.db.collection("settings");
const now = new Date();

const defaults = [
  {
    key: "ride_support_phone",
    value: "+91 90000 00000",
    description: "Support number shown to users for ride emergencies.",
  },
  {
    key: "ride_security_phone",
    value: "+91 100",
    description: "Security helpline shown in emergency contacts.",
  },
  {
    key: "ride_ambulance_phone",
    value: "+91 108",
    description: "Medical emergency number shown in emergency contacts.",
  },
  {
    key: "ride_booking_enabled",
    value: true,
    description: "Enable or disable new ride requests platform-wide.",
  },
  {
    key: "ride_max_passengers",
    value: 4,
    description: "Upper limit for rider count in one booking.",
  },
  {
    key: "ride_location_sync_interval_seconds",
    value: 5,
    description: "Recommended interval for live location updates during active rides.",
  },
];

for (const item of defaults) {
  await settings.updateOne(
    { key: item.key },
    {
      $set: {
        key: item.key,
        value: item.value,
        description: item.description,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

console.log(`Seeded ${defaults.length} ride settings`);
await mongoose.disconnect();
