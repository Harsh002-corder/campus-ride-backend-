export const ROLES = {
  STUDENT: "student",
  DRIVER: "driver",
  ADMIN: "admin",
};

export const RIDE_STATUS = {
  SCHEDULED: "scheduled",
  REQUESTED: "pending",
  ACCEPTED: "accepted",
  ONGOING: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const ALLOWED_ROLES = Object.values(ROLES);