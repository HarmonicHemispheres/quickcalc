/* CodeMirror 6 bundle entry — exposes a single `window.CM` object.
   Bundle: `npm run build:editor`
   The bundle is committed so npm start works without rebuilding. */
import {EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, keymap} from '@codemirror/view';
import {EditorState, Compartment, EditorSelection} from '@codemirror/state';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {searchKeymap, highlightSelectionMatches} from '@codemirror/search';
import {closeBrackets, closeBracketsKeymap} from '@codemirror/autocomplete';

window.CM = {
  EditorView,
  EditorState,
  Compartment,
  EditorSelection,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  keymap,
  markdown,
  markdownLanguage,
  syntaxHighlighting,
  HighlightStyle,
  indentOnInput,
  bracketMatching,
  tags,
  defaultKeymap,
  history,
  historyKeymap,
  searchKeymap,
  highlightSelectionMatches,
  closeBrackets,
  closeBracketsKeymap,
};
