import { createId as createCuid2, isCuid } from "@paralleldrive/cuid2";
import { customAlphabet } from "nanoid";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const createRoomCodeId = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

export const createId = () => createCuid2();

export const isCuid2 = (value: string) => isCuid(value);

export const createRoomCode = (prefix: string = "TIER") => {
  return `${prefix}-${createRoomCodeId()}`;
};
