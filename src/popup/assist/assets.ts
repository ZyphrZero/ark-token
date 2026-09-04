const CDN = 'https://web.hycdn.cn/arknights/game/assets'

export function assistAvatarUrl(id?: string): string | undefined {
  return id ? `${CDN}/avatar/${encodeURIComponent(id)}.png` : undefined
}

export function assistCharacterUrl(charId: string, skinId?: string): string | undefined {
  if (skinId) {
    return `${CDN}/char_skin/avatar/${encodeURIComponent(skinId)}.png`
  }
  return charId ? `${CDN}/char/portrait/${encodeURIComponent(charId)}_1.png` : undefined
}

export function assistSkillUrl(skillId?: string): string | undefined {
  return skillId ? `${CDN}/char_skill/${encodeURIComponent(skillId)}.png` : undefined
}

export function assistEquipUrl(typeName?: string): string | undefined {
  return typeName ? `${CDN}/uniequip/type/${encodeURIComponent(typeName)}.png` : undefined
}
