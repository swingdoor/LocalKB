import xiaolaiUrl from '@renderer/assets/fonts/Xiaolai-Regular.ttf'

export async function loadXiaolaiFont() {
  const font = new FontFace('Xiaolai', `url(${xiaolaiUrl})`)
  const loaded = await font.load()
  document.fonts.add(loaded)
}
