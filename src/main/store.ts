import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { Document, Vault, VaultMeta, AISettings, HotkeyConfig } from '../shared/types'
import { DEFAULT_HOTKEYS } from '../shared/types'

// 数据存储路径
const getDataPath = () => {
  return path.join(app.getPath('userData'), 'data')
}

const getVaultsPath = () => {
  return path.join(getDataPath(), 'vaults')
}

// 确保目录存在
const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// Vault 操作
export const vaultStore = {
  // 获取所有 Vault
  list(): Vault[] {
    const vaultsPath = getVaultsPath()
    ensureDir(vaultsPath)
    
    const vaultDirs = fs.readdirSync(vaultsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
    
    const vaults: Vault[] = []
    for (const dir of vaultDirs) {
      const metaPath = path.join(vaultsPath, dir.name, 'meta.json')
      if (fs.existsSync(metaPath)) {
        try {
          const meta: VaultMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
          vaults.push(meta.vault)
        } catch (e) {
          console.error('Failed to read vault meta:', e)
        }
      }
    }
    
    return vaults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  // 创建 Vault
  create(name: string): Vault {
    const vaultsPath = getVaultsPath()
    const id = uuidv4()
    const vault: Vault = {
      id,
      name,
      createdAt: new Date().toISOString(),
    }
    
    const vaultPath = path.join(vaultsPath, id)
    ensureDir(vaultPath)
    ensureDir(path.join(vaultPath, 'documents'))
    
    const meta: VaultMeta = {
      vault,
      documents: [],
    }
    
    fs.writeFileSync(
      path.join(vaultPath, 'meta.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    )
    
    return vault
  },

  // 删除 Vault
  delete(vaultId: string): boolean {
    const vaultPath = path.join(getVaultsPath(), vaultId)
    if (fs.existsSync(vaultPath)) {
      fs.rmSync(vaultPath, { recursive: true, force: true })
      return true
    }
    return false
  },

  // 重命名 Vault
  rename(vaultId: string, newName: string): Vault | null {
    const vaultPath = path.join(getVaultsPath(), vaultId)
    const metaPath = path.join(vaultPath, 'meta.json')
    
    if (fs.existsSync(metaPath)) {
      const meta: VaultMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      meta.vault.name = newName
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      return meta.vault
    }
    return null
  },
}

// Document 操作
export const documentStore = {
  // 获取 Vault 下所有文档
  list(vaultId: string): Document[] {
    const documentsPath = path.join(getVaultsPath(), vaultId, 'documents')
    ensureDir(documentsPath)
    
    const files = fs.readdirSync(documentsPath)
      .filter(f => f.endsWith('.json'))
    
    const documents: Document[] = []
    for (const file of files) {
      try {
        const doc: Document = JSON.parse(
          fs.readFileSync(path.join(documentsPath, file), 'utf-8')
        )
        documents.push(doc)
      } catch (e) {
        console.error('Failed to read document:', e)
      }
    }
    
    return documents.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  },

  // 获取单个文档
  get(vaultId: string, docId: string): Document | null {
    const docPath = path.join(getVaultsPath(), vaultId, 'documents', `${docId}.json`)
    if (fs.existsSync(docPath)) {
      return JSON.parse(fs.readFileSync(docPath, 'utf-8'))
    }
    return null
  },

  // 创建文档
  create(vaultId: string, title: string, type: 'document' | 'drawing' = 'document'): Document {
    const documentsPath = path.join(getVaultsPath(), vaultId, 'documents')
    ensureDir(documentsPath)
    
    const id = uuidv4()
    const now = new Date().toISOString()
    
    const doc: Document = {
      id,
      title,
      content: type === 'document' ? JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph' }]
      }) : JSON.stringify({
        elements: [],
        appState: {},
        files: {}
      }),
      type,
      createdAt: now,
      updatedAt: now,
    }
    
    fs.writeFileSync(
      path.join(documentsPath, `${id}.json`),
      JSON.stringify(doc, null, 2),
      'utf-8'
    )
    
    // 更新 Vault meta
    const metaPath = path.join(getVaultsPath(), vaultId, 'meta.json')
    if (fs.existsSync(metaPath)) {
      const meta: VaultMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      meta.documents.push(id)
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    }
    
    return doc
  },

  // 更新文档
  update(vaultId: string, docId: string, data: Partial<Pick<Document, 'title' | 'content'>>): Document | null {
    const docPath = path.join(getVaultsPath(), vaultId, 'documents', `${docId}.json`)
    
    if (fs.existsSync(docPath)) {
      const doc: Document = JSON.parse(fs.readFileSync(docPath, 'utf-8'))
      
      if (data.title !== undefined) doc.title = data.title
      if (data.content !== undefined) doc.content = data.content
      doc.updatedAt = new Date().toISOString()
      
      fs.writeFileSync(docPath, JSON.stringify(doc, null, 2), 'utf-8')
      return doc
    }
    return null
  },

  // 删除文档
  delete(vaultId: string, docId: string): boolean {
    const docPath = path.join(getVaultsPath(), vaultId, 'documents', `${docId}.json`)
    
    if (fs.existsSync(docPath)) {
      fs.unlinkSync(docPath)
      
      // 更新 Vault meta
      const metaPath = path.join(getVaultsPath(), vaultId, 'meta.json')
      if (fs.existsSync(metaPath)) {
        const meta: VaultMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        meta.documents = meta.documents.filter(id => id !== docId)
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      }
      
      return true
    }
    return false
  },

  // 搜索文档
  search(vaultId: string, query: string): Document[] {
    const documents = this.list(vaultId)
    const lowerQuery = query.toLowerCase()
    
    return documents.filter(doc => {
      // 搜索标题
      if (doc.title.toLowerCase().includes(lowerQuery)) return true
      
      // 搜索内容（尝试解析 JSON 内容）
      try {
        const content = JSON.parse(doc.content)
        const textContent = extractTextFromContent(content)
        if (textContent.toLowerCase().includes(lowerQuery)) return true
      } catch {
        if (doc.content.toLowerCase().includes(lowerQuery)) return true
      }
      
      return false
    })
  },
}

// 从 TipTap JSON 内容中提取文本
function extractTextFromContent(node: any): string {
  let text = ''
  
  if (node.text) {
    text += node.text
  }
  
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      text += extractTextFromContent(child) + ' '
    }
  }
  
  return text.trim()
}

// 默认设置
const defaultAISettings: AISettings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  polishPrompt: '请对以下文本进行润色，使其更加流畅、专业，同时保持原意不变。只返回润色后的文本，不要添加任何解释或说明：\n\n',
  expandPrompt: '请对以下文本进行扩写，丰富内容细节，增加相关论述，使其更加完整充实。只返回扩写后的文本，不要添加任何解释或说明：\n\n',
}

// 设置存储
export const settingsStore = {
  // 获取设置文件路径
  getSettingsPath(): string {
    return path.join(getDataPath(), 'settings.json')
  },

  // 获取 AI 设置
  getAISettings(): AISettings {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        return { ...defaultAISettings, ...settings.ai }
      } catch (e) {
        console.error('Failed to read settings:', e)
      }
    }
    return { ...defaultAISettings }
  },

  // 保存 AI 设置
  saveAISettings(settings: Partial<AISettings>): AISettings {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    let allSettings: any = {}
    if (fs.existsSync(settingsPath)) {
      try {
        allSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch (e) {
        console.error('Failed to read settings:', e)
      }
    }
    
    const newAISettings = { ...defaultAISettings, ...allSettings.ai, ...settings }
    allSettings.ai = newAISettings
    
    fs.writeFileSync(settingsPath, JSON.stringify(allSettings, null, 2), 'utf-8')
    return newAISettings
  },

  // 获取主题设置
  getTheme(): string {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        return settings.theme || 'white'
      } catch (e) {
        console.error('Failed to read settings:', e)
      }
    }
    return 'white'
  },

  // 保存主题设置
  saveTheme(theme: string): string {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    let allSettings: any = {}
    if (fs.existsSync(settingsPath)) {
      try {
        allSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch (e) {
        console.error('Failed to read settings:', e)
      }
    }
    
    allSettings.theme = theme
    fs.writeFileSync(settingsPath, JSON.stringify(allSettings, null, 2), 'utf-8')
    return theme
  },

  // 获取默认配置（已禁用，仅保留用于数据迁移）
  getDefaultConfig() {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        return settings.defaultConfig || { defaultFont: 'default', defaultFontColor: 'auto', defaultTheme: 'white' }
      } catch (e) {
        console.error('Failed to read default config:', e)
      }
    }
    return { defaultFont: 'default', defaultFontColor: 'auto', defaultTheme: 'white' }
  },

  // 保存默认配置（已禁用，仅保留用于数据迁移）
  saveDefaultConfig(config: any): any {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    let allSettings: any = {}
    if (fs.existsSync(settingsPath)) {
      try {
        allSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch (e) {
        console.error('Failed to read settings:', e)
      }
    }
    
    const current = allSettings.defaultConfig || { defaultFont: 'default', defaultFontColor: 'auto', defaultTheme: 'white' }
    const newConfig = { ...current, ...config }
    allSettings.defaultConfig = newConfig
    
    fs.writeFileSync(settingsPath, JSON.stringify(allSettings, null, 2), 'utf-8')
    return newConfig
  },

  // 获取快捷键配置
  getHotkeys(): HotkeyConfig[] {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        return settings.hotkeys || DEFAULT_HOTKEYS
      } catch (e) {
        console.error('Failed to read hotkeys:', e)
      }
    }
    return DEFAULT_HOTKEYS
  },

  // 保存快捷键配置
  saveHotkeys(hotkeys: HotkeyConfig[]): HotkeyConfig[] {
    const settingsPath = this.getSettingsPath()
    ensureDir(getDataPath())
    
    let allSettings: any = {}
    if (fs.existsSync(settingsPath)) {
      try {
        allSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch (e) {
        console.error('Failed to read settings:', e)
      }
    }
    
    allSettings.hotkeys = hotkeys
    fs.writeFileSync(settingsPath, JSON.stringify(allSettings, null, 2), 'utf-8')
    return hotkeys
  },
}

// 图片存储
export const imageStore = {
  // 保存图片
  save(vaultId: string, imageData: string, fileName: string): string {
    const imagesPath = path.join(getVaultsPath(), vaultId, 'images')
    ensureDir(imagesPath)

    const ext = path.extname(fileName) || '.png'
    const id = uuidv4()
    const imagePath = path.join(imagesPath, `${id}${ext}`)

    // 处理 base64 数据
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(imagePath, base64Data, 'base64')

    return imagePath
  },

  // 读取图片为 base64
  read(imagePath: string): string | null {
    const vaultsPath = getVaultsPath()
    const resolvedPath = path.resolve(imagePath)
    // 防止路径穿越攻击：确保路径在 vault 目录内
    if (!resolvedPath.startsWith(path.resolve(vaultsPath))) {
      console.error('Image path traversal attempt:', imagePath)
      return null
    }

    if (fs.existsSync(resolvedPath)) {
      const data = fs.readFileSync(resolvedPath)
      const ext = path.extname(resolvedPath).slice(1)
      return `data:image/${ext};base64,${data.toString('base64')}`
    }
    return null
  },
}
