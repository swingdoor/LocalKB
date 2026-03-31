/**
 * 清理 Excalidraw 数据：移除已删除的元素和无引用的文件
 */
export function cleanExcalidrawData(elements: any[], files: any) {
  const activeElements = elements.filter(el => !(el as any).isDeleted)
  
  const validFileIds = new Set<string>()
  for (const el of activeElements) {
    if (el.type === 'image' && (el as any).fileId) {
      validFileIds.add((el as any).fileId)
    }
  }
  
  const cleanedFiles: any = {}
  for (const fileId of Object.keys(files || {})) {
    if (validFileIds.has(fileId)) {
      cleanedFiles[fileId] = files[fileId]
    }
  }
  
  return { activeElements, cleanedFiles }
}
