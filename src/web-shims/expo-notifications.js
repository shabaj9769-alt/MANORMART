export const AndroidImportance = {
  UNKNOWN: 0,
  UNSPECIFIED: 1,
  NONE: 2,
  MIN: 3,
  LOW: 4,
  DEFAULT: 5,
  HIGH: 6,
  MAX: 7,
};

export function setNotificationHandler() {}
export async function setNotificationChannelAsync() {}
export async function getPermissionsAsync() {
  return { status: 'undetermined', granted: false };
}
export async function requestPermissionsAsync() {
  return { status: 'denied', granted: false };
}
export async function getExpoPushTokenAsync() {
  return { data: '' };
}
