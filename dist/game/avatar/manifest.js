function spriteUrl(relativePath) {
  return new URL(relativePath, import.meta.url).href;
}

export const DEFAULT_AVATAR_SKIN = "neon";

export const AVATAR_SKINS = {
  neon: {
    id: "neon",
    label: "Neon Runner",
    spriteSheet: spriteUrl("../../assets/avatars/neon/avatar.svg"),
    sprites: {
      idle: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      run: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      shift: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      shield: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      hit: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      move_left: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      move_right: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      miss: spriteUrl("../../assets/avatars/neon/avatar.svg"),
      game_over: spriteUrl("../../assets/avatars/neon/avatar.svg"),
    },
  },
  sakura: {
    id: "sakura",
    label: "Sakura Blade",
    spriteSheet: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
    sprites: {
      idle: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      run: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      shift: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      shield: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      hit: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      move_left: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      move_right: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      miss: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
      game_over: spriteUrl("../../assets/avatars/sakura/avatar.svg"),
    },
  },
  prototype: {
    id: "prototype",
    label: "Prototype (Fallback)",
    sprites: {},
  },
};

export function listAvatarSkins() {
  return Object.values(AVATAR_SKINS).map((skin) => ({
    id: skin.id,
    label: skin.label,
  }));
}

export function getAvatarSkinConfig(skinId) {
  return AVATAR_SKINS[skinId] ?? AVATAR_SKINS[DEFAULT_AVATAR_SKIN];
}
