/** Make an approved upload the cover without discarding existing gallery images. */
export function prioritizeApprovedImage(images: string[], url: string): string[] {
  return [url, ...images.filter(image => image !== url)];
}
