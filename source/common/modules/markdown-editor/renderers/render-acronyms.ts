/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Acronyms renderer
 * CVM-Role:        View
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     An renderer for acronyms
 *
 * END HEADER
 */

import { renderInlineWidgets } from './base-renderer'
import { SyntaxNodeRef, SyntaxNode } from '@lezer/common'
import { EditorView, WidgetType } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import clickAndSelect from './click-and-select'

const ipcRenderer = window.ipc
class AcronymWidget extends WidgetType {
  constructor (readonly nodeContents: string, readonly node: SyntaxNode) {
    super()
  }

  eq (other: AcronymWidget): boolean {
    return other.nodeContents === this.nodeContents &&
            other.node.from === this.node.from &&
            other.node.to === this.node.to
  }

  toDOM (view: EditorView): HTMLElement {
    let elem = document.createElement('span')
    elem.setAttribute('style', 'text-decoration: underline dotted;')
    let contents = this.nodeContents
    let id = contents
    let classes: string[] = []
    let matchComplex = contents.match(/\[\+(.*)]\{([^}]+)\}/)
    let matchSimple = contents.match(/^\+(.*)\s*$/)
    if (matchComplex != null) {
      id = matchComplex[1]
      classes = matchComplex[2].split(/\s?\./)
    } else if (matchSimple != null) {
      id = matchSimple[1]
      classes = []
    }

    let result = ipcRenderer.sendSync('acronyms-provider', { command: 'get-acronym', payload: { id, classes } })
    if (result != null) {
      contents = result
    } else {
      elem.setAttribute('title', 'unknown acronym')
      elem.setAttribute('style', `${elem.getAttribute('style') ?? ''}color: red`)
    }

    elem.textContent = contents
    elem.addEventListener('mousedown', clickAndSelect(view, this.node))
    return elem
  }

  ignoreEvent (event: Event): boolean {
    return event instanceof MouseEvent
  }
}

function shouldHandleNode (node: SyntaxNodeRef): boolean {
  return node.type.name === 'Acronym'
}

function createWidget (state: EditorState, node: SyntaxNodeRef): AcronymWidget|undefined {
  return new AcronymWidget(state.sliceDoc(node.from, node.to), node.node)
}

export const renderAcronyms = renderInlineWidgets(shouldHandleNode, createWidget)
