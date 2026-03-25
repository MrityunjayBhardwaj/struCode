import type * as Monaco from 'monaco-editor'

export function registerSonicPiLanguage(monaco: typeof Monaco): void {
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'sonicpi')) return

  monaco.languages.register({ id: 'sonicpi' })

  monaco.languages.setMonarchTokensProvider('sonicpi', {
    defaultToken: '',
    tokenPostfix: '.sonicpi',

    keywords: [
      'do', 'end', 'if', 'else', 'elsif', 'unless', 'loop', 'while', 'until',
      'for', 'in', 'begin', 'rescue', 'ensure', 'true', 'false', 'nil', 'and', 'or', 'not',
    ],

    sonicPiFunctions: [
      'live_loop', 'play', 'sample', 'sleep', 'sync', 'cue', 'in_thread',
      'use_synth', 'use_bpm', 'use_random_seed', 'with_fx', 'control',
      'define', 'density', 'puts', 'print',
    ],

    musicFunctions: [
      'choose', 'rrand', 'rrand_i', 'rand', 'rand_i', 'dice', 'one_in',
      'ring', 'knit', 'range', 'line', 'spread', 'chord', 'scale',
      'note', 'hz_to_midi', 'midi_to_hz', 'tick', 'look',
    ],

    tokenizer: {
      root: [
        // Ruby comment
        [/#.*$/, 'comment'],

        // Ruby symbols :name
        [/:\w+/, 'sonicpi.symbol'],

        // Sonic Pi DSL functions
        [
          /\b(live_loop|play|sample|sleep|sync|cue|in_thread|use_synth|use_bpm|use_random_seed|with_fx|control|define|density)\b/,
          'sonicpi.function',
        ],

        // Music/math helper functions
        [
          /\b(choose|rrand|rrand_i|rand|rand_i|dice|one_in|ring|knit|range|line|spread|chord|scale|note|hz_to_midi|midi_to_hz|tick|look)\b/,
          'sonicpi.music',
        ],

        // Keywords
        [/\b(do|end|if|else|elsif|unless|loop|while|until|for|in|true|false|nil)\b/, 'keyword'],

        // Note names: c3, eb4, f#2
        [/\b[a-gA-G][bs#]?\d\b/, 'sonicpi.note'],

        // Numbers
        [/\b\d+(\.\d+)?\b/, 'number'],

        // Strings
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_single'],

        // Keyword args (release:, amp:, rate:)
        [/\b(\w+):/, 'sonicpi.kwarg'],
      ],

      string_double: [
        [/#\{/, 'string.interpolation', '@interpolation'],
        [/"/, 'string', '@pop'],
        [/[^"#]+/, 'string'],
        [/./, 'string'],
      ],

      string_single: [
        [/'/, 'string', '@pop'],
        [/[^']+/, 'string'],
      ],

      interpolation: [
        [/\}/, 'string.interpolation', '@pop'],
        { include: 'root' },
      ],
    },
  })

  monaco.languages.setLanguageConfiguration('sonicpi', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })
}

export function registerStrudelLanguage(monaco: typeof Monaco): void {
  // Only register once
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'strudel')) return

  monaco.languages.register({ id: 'strudel' })

  monaco.languages.setMonarchTokensProvider('strudel', {
    defaultToken: '',
    tokenPostfix: '.strudel',

    keywords: [
      'const', 'let', 'var', 'await', 'async', 'return', 'if', 'else',
      'for', 'while', 'function', 'class', 'import', 'export', 'from',
    ],

    strudelFunctions: [
      'note', 's', 'gain', 'release', 'sustain', 'cutoff', 'resonance',
      'stack', 'mask', 'speed', 'room', 'delay', 'distort', 'fm', 'swing',
      'struct', 'every', 'sometimes', 'jux', 'off', 'fast', 'slow', 'rev',
      'palindrome', 'chunk', 'iter', 'euclid', 'euclidRot', 'degradeBy',
      'layer', 'cat', 'seq', 'silence', 'pure', 'reify', 'sub', 'add',
      'mul', 'div', 'mod', 'abs', 'range', 'rangex', 'rand', 'irand',
      'perlin', 'sine', 'saw', 'square', 'tri', 'setcps', 'setCps',
      'cpm', 'hpf', 'lpf', 'bpf', 'crush', 'shape', 'coarse', 'begin',
      'end', 'loop', 'loopBegin', 'loopEnd', 'pan', 'orbit', 'color',
      'velocity', 'amp', 'legato', 'accel', 'unit', 'cut', 'n', 'bank',
      'stretch', 'nudge', 'degrade', 'ftype', 'fanchor', 'vowel',
    ],

    tokenizer: {
      root: [
        // $: pattern-start marker
        [/\$\s*:/, 'strudel.pattern-start'],

        // setcps / setCps tempo
        [/\bsetcps\b|\bsetCps\b/, 'strudel.tempo'],

        // Note names: c3, eb4, f#2, C#5
        [/\b[a-gA-G][b#]?\d\b/, 'strudel.note'],

        // Strudel function names (must come before keywords check)
        [
          /\b(note|s|gain|release|sustain|cutoff|resonance|stack|mask|speed|room|delay|distort|fm|swing|struct|every|sometimes|jux|off|fast|slow|rev|palindrome|chunk|iter|euclid|euclidRot|degradeBy|layer|cat|seq|silence|pure|reify|range|rangex|rand|irand|perlin|cpm|hpf|lpf|bpf|crush|shape|coarse|begin|end|loop|pan|orbit|color|velocity|amp|legato|accel|unit|cut|bank|stretch|nudge|degrade|vowel)\b/,
          'strudel.function',
        ],

        // JS keywords
        [
          /\b(const|let|var|await|async|return|if|else|for|while|function|class|import|export|from)\b/,
          'keyword',
        ],

        // Line comment
        [/\/\/.*$/, 'comment'],

        // Block comment
        [/\/\*/, 'comment', '@block_comment'],

        // Strings (mini-notation)
        [/"/, 'string', '@mini_string_double'],
        [/'/, 'string', '@mini_string_single'],
        [/`/, 'string', '@template_string'],

        // Numbers
        [/\b\d+(\.\d+)?\b/, 'number'],
      ],

      block_comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],

      mini_string_double: [
        [/[~*!%?@<>\[\]{}|,_]/, 'strudel.mini.operator'],
        [/[a-gA-G][b#]?\d?/, 'strudel.mini.note'],
        [/\d+(\.\d+)?/, 'strudel.mini.number'],
        [/"/, 'string', '@pop'],
        [/[^"]+/, 'string'],
      ],

      mini_string_single: [
        [/[~*!%?@<>\[\]{}|,_]/, 'strudel.mini.operator'],
        [/[a-gA-G][b#]?\d?/, 'strudel.mini.note'],
        [/\d+(\.\d+)?/, 'strudel.mini.number'],
        [/'/, 'string', '@pop'],
        [/[^']+/, 'string'],
      ],

      template_string: [
        [/`/, 'string', '@pop'],
        [/[^`]+/, 'string'],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration('strudel', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })
}
