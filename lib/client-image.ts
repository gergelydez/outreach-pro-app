// Micșorează o poză în browser (max 1600 px, JPEG), ca să urce repede și să nu încarce site-ul
export async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('invalid image'))), 'image/jpeg', 0.82))
}
