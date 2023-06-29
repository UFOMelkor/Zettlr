/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Citation Autocomplete
 * CVM-Role:        Autocomplete Plugin
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This plugin manages citations.
 *
 * END HEADER
 */

import { type AutocompletePlugin } from '.'
import { type EditorView } from '@codemirror/view'
import { type Completion } from '@codemirror/autocomplete'

const ipcRenderer = window.ipc

export const acronymClassesWithoutAttributes: AutocompletePlugin = {
  applies (ctx) {
    const { text, from } = ctx.state.doc.lineAt(ctx.pos)
    const textBefore = text.slice(0, ctx.pos - from)
    if (/\+\w+\.\w*$/.test(textBefore)) {
      // The text immediately before the cursor matches a valid acronym without attributes and a dot afterwards
      return from + textBefore.lastIndexOf('+')
    }
    // Nopey
    return false
  },

  entries (ctx, query) {
    query = query.toLowerCase()
    if (!query.includes('.') || !query.includes('+')) {
      return []
    }

    const acronymLowerCase = query.slice(1, query.indexOf('.'))
    const suffix = query.slice(query.indexOf('.') + 1)

    // First get the acronym
    const acronymId = (ipcRenderer.sendSync('acronyms-provider', { command: 'all-acronyms', payload: {} }) as Array<{ id: string, full: string, long: string, short: string }>)
      .find((each) => each.id.toLowerCase() === acronymLowerCase)?.id

    if (typeof acronymId === 'undefined') {
      return []
    }

    const entries: Array<{ label: string }> = ipcRenderer.sendSync('acronyms-provider', { command: 'all-classes', payload: {} }).map((each: string) => ({ label: each }))
    entries.sort((a, b) => {
      const aStartsWith = a.label.toLowerCase().startsWith(suffix)
      const bStartsWith = b.label.toLowerCase().startsWith(suffix)
      if (aStartsWith && !bStartsWith) {
        return -1
      }
      if (bStartsWith && !aStartsWith) {
        return 1
      }
      return 0
    })
    return entries.filter((entry) => {
      return entry.label.toLowerCase().includes(suffix)
    }).map((each) => ({
      apply: '[+' + acronymId + ']{.' + each.label + '}',
      label: each.label
    }))
  }
}

export const acronymClasses: AutocompletePlugin = {
  applies (ctx) {
    const { text, from } = ctx.state.doc.lineAt(ctx.pos)
    const textBefore = text.slice(0, ctx.pos - from)
    if (/\[\+\w+]{(\s*\.\w*)+$/.test(textBefore)) {
      // The text immediately before the cursor matches a valid acronym
      return from + textBefore.lastIndexOf('.') + 1
    } else {
      // Nopey
      return false
    }
  },
  entries (ctx, query) {
    query = query.toLowerCase()
    const entries: Array<{ label: string }> = ipcRenderer.sendSync('acronyms-provider', { command: 'all-classes', payload: {} }).map((each: string) => ({ label: each }))
    entries.sort((a, b) => {
      const aStartsWith = a.label.toLowerCase().startsWith(query)
      const bStartsWith = b.label.toLowerCase().startsWith(query)
      if (aStartsWith && !bStartsWith) {
        return -1
      }
      if (bStartsWith && !aStartsWith) {
        return 1
      }
      return 0
    })
    return entries.filter((entry) => {
      return entry.label.toLowerCase().includes(query)
    })
  }
}

export const acronyms: AutocompletePlugin = {
  applies (ctx) {
    // A valid acronym position is: Beginning of the line (acronym without square
    // brackets), after a square bracket open (regular citation without prefix),
    // or after a space (either a standalone citation or within square brackets
    // but with a prefix)..
    const { text, from } = ctx.state.doc.lineAt(ctx.pos)
    const textBefore = text.slice(0, ctx.pos - from)
    if (text.startsWith('+') && ctx.pos - from === 1) {
      // The line starts with an + and the cursor is directly behind it
      return ctx.pos
    } else if (/(?<=[[\s])\+[^[\]]*$/.test(textBefore)) {
      // The text immediately before the cursor matches a valid acronym
      return from + textBefore.lastIndexOf('+') + 1
    }
    return false
  },
  entries (ctx, query) {
    query = query.toLowerCase()
    let bracketBefore = (ctx.matchBefore(/\[\+/))
    const acronyms = (ipcRenderer.sendSync('acronyms-provider', { command: 'all-acronyms', payload: {} }) as Array<{ id: string, full: string, long: string, short: string }>)
      .filter((each) => each.id.toLowerCase().includes(query) || each.full.toLowerCase().includes(query))
    acronyms.sort((a, b) => {
      const aStartsWith = a.id.toLowerCase().startsWith(query) || a.short.toLowerCase().startsWith(query) || a.long.toLowerCase().startsWith(query)
      const bStartsWith = b.id.toLowerCase().startsWith(query) || b.short.toLowerCase().startsWith(query) || b.long.toLowerCase().startsWith(query)
      if (aStartsWith && !bStartsWith) {
        return -1
      }
      if (bStartsWith && !aStartsWith) {
        return 1
      }
      const aShortContains = a.id.toLowerCase().includes(query) || a.short.toLowerCase().includes(query)
      const bShortContains = b.id.toLowerCase().includes(query) || b.short.toLowerCase().includes(query)

      if (aShortContains && !bShortContains) {
        return -1
      }
      if (bShortContains && !aShortContains) {
        return 1
      }
      if (a.id === b.id) {
        return 0
      }
      return a.id < b.id ? -1 : 1
    })
    const entries = acronyms.map((each) => ({ label: each.id, detail: each.full })) as Completion[]
    if (bracketBefore != null) {
      entries.forEach((each) => {
        each.apply = (view: EditorView, completion: Completion, from: number, to: number) => {
          view.dispatch({
            changes: [{ from: from + 1, insert: '{}' }, { from, to, insert: completion.label }],
            selection: { anchor: from + completion.label.length+2 }
          })
        }
      })
    }
    return entries
  }
}
