import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const headingNumbersKey = new PluginKey('headingNumbers')

/**
 * 为标题节点添加 data-heading-number 属性的装饰器
 * 序号计算逻辑与 TOC 一致：跳过零值层级，支持任意起始层级
 */
export const HeadingNumbers = Extension.create({
  name: 'headingNumbers',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingNumbersKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const counters = [0, 0, 0, 0, 0, 0]

            state.doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                const level = (node.attrs.level as number) ?? 1
                const idx = level - 1

                for (let i = idx + 1; i < counters.length; i++) {
                  counters[i] = 0
                }
                counters[idx]++

                const parts: number[] = []
                for (let i = 0; i <= idx; i++) {
                  if (counters[i] > 0) {
                    parts.push(counters[i])
                  }
                }

                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-heading-number': parts.join('.'),
                  })
                )
              }
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
