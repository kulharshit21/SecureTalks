import { create } from "zustand";

import { createMessageCipher } from "@/lib/crypto/session";
import type { SessionCipher } from "@/lib/crypto/types";
import type { UnlockedPrivateCrypto } from "@/lib/crypto/types";

export interface CipherSessionSlice {
  userId: string | null;
  deviceId: string | null;
  privateCrypto: UnlockedPrivateCrypto | null;
  cipher: SessionCipher | null;
  unlock: (input: { userId: string; deviceId: string; privateCrypto: UnlockedPrivateCrypto }) => void;
  lock: () => void;
}

export const useCipherSession = create<CipherSessionSlice>((set) => ({
  userId: null,
  deviceId: null,
  privateCrypto: null,
  cipher: null,
  unlock: ({ userId, deviceId, privateCrypto }) =>
    set({
      userId,
      deviceId,
      privateCrypto,
      cipher: createMessageCipher(privateCrypto),
    }),
  lock: () =>
    set({
      userId: null,
      deviceId: null,
      privateCrypto: null,
      cipher: null,
    }),
}));
