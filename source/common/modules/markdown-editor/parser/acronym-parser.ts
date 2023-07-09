/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Acronym Parser
 * CVM-Role:        InlineParser
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This inline parser adds acronym elements to the Lezer tree.
 *
 * END HEADER
 */

import { type InlineParser } from '@lezer/markdown'

// TODO: Docs for this: https://github.com/lezer-parser/markdown#user-content-blockparser
export const acronymParser: InlineParser = {
  // This parser should only match configured acronyms
  name: 'acronym',
  before: 'Link', // [+lol] will otherwise be detected as a link
  parse (ctx, next, pos) {
    const relativePosition = pos - ctx.offset
    const matchWithBrackets = /\[\+\p{Letter}+\]\{(\.\w+\s?)*\}/u.exec(ctx.text.slice(relativePosition))

    if (matchWithBrackets !== null && matchWithBrackets.index <= 0) {
      return ctx.addElement(ctx.elt('Acronym', pos, pos + matchWithBrackets[0].length))
    }

    const matchWithoutBrackets = /(?<!\[)\+\p{Letter}+/u.exec(ctx.text.slice(relativePosition))
    if (matchWithoutBrackets === null || matchWithoutBrackets.index > 0) {
      return -1
    }
    if (ctx.text.slice(relativePosition - 1, relativePosition) === '[') {
      return -1
    }

    // At this point we have an acronym, and it's at the current pos
    return ctx.addElement(ctx.elt('Acronym', pos, pos + matchWithoutBrackets[0].length))
  }
}
