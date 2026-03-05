import { RIDE_STATUS } from "../constants/roles.js";

export async function generateUniqueRideCode(ridesCollection) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const code = String(Math.floor(10 + Math.random() * 90));
    const existing = await ridesCollection.findOne({
      verificationCode: code,
      status: { $in: [RIDE_STATUS.REQUESTED, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
    });
    if (!existing) {
      return code;
    }
  }
  return String(Math.floor(10 + Math.random() * 90));
}