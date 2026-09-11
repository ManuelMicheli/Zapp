const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCollectorInjection,
  collectHistory,
  isAllowedCollectionUrl,
  isAllowedNetflixNavigation,
  parseHistoryMessage,
} = require('../src/netflix-protocol');

const REQUEST_ID = 'history-42';
const SOURCE_URL = 'https://www.netflix.com/viewingactivity';

function validMessage(overrides = {}) {
  return JSON.stringify({
    v: 1,
    type: 'netflix-history',
    requestId: REQUEST_ID,
    sourceUrl: SOURCE_URL,
    profileLabel: 'Profilo prova',
    heading: 'Attività di visione',
    rows: [
      {
        date: '10/9/26',
        title: 'Serie dimostrativa: Stagione 1: "Episodio 2"',
        href: '/title/81249836',
      },
    ],
    ...overrides,
  });
}

test('consente soltanto navigazioni HTTPS su netflix.com e sottodomini reali', () => {
  assert.equal(isAllowedNetflixNavigation('https://www.netflix.com/login'), true);
  assert.equal(isAllowedNetflixNavigation('https://netflix.com/browse'), true);
  assert.equal(isAllowedNetflixNavigation('https://help.netflix.com/it'), true);
  assert.equal(isAllowedNetflixNavigation('http://www.netflix.com/login'), false);
  assert.equal(isAllowedNetflixNavigation('https://netflix.com.example.test/login'), false);
  assert.equal(isAllowedNetflixNavigation('javascript:alert(1)'), false);
  assert.equal(isAllowedNetflixNavigation('https://example.test/'), false);
});

test('accetta messaggi soltanto dalla pagina di raccolta esatta', () => {
  assert.equal(isAllowedCollectionUrl(SOURCE_URL), true);
  assert.equal(isAllowedCollectionUrl(`${SOURCE_URL}?x=1`), false);
  assert.equal(isAllowedCollectionUrl(`${SOURCE_URL}#x`), false);
  assert.equal(isAllowedCollectionUrl('https://netflix.com/viewingactivity'), false);
  assert.equal(isAllowedCollectionUrl('https://www.netflix.com/login'), false);
});

test('valida origine, richiesta pendente e schema chiuso del messaggio', () => {
  const parsed = parseHistoryMessage({
    data: validMessage(),
    eventUrl: SOURCE_URL,
    pendingRequestId: REQUEST_ID,
  });

  assert.deepEqual(parsed.rows[0], {
    date: '10/9/26',
    title: 'Serie dimostrativa: Stagione 1: "Episodio 2"',
    href: '/title/81249836',
  });
  assert.equal(parsed.profileLabel, 'Profilo prova');

  assert.throws(() =>
    parseHistoryMessage({
      data: validMessage(),
      eventUrl: SOURCE_URL,
      pendingRequestId: null,
    }),
  );
  assert.throws(() =>
    parseHistoryMessage({
      data: validMessage(),
      eventUrl: SOURCE_URL,
      pendingRequestId: 'history-stale',
    }),
  );
  assert.throws(() =>
    parseHistoryMessage({
      data: validMessage(),
      eventUrl: 'https://www.netflix.com/login',
      pendingRequestId: REQUEST_ID,
    }),
  );
});

test('rifiuta chiavi sconosciute, href non osservati e payload troppo grandi', () => {
  assert.throws(() =>
    parseHistoryMessage({
      data: validMessage({ unexpected: true }),
      eventUrl: SOURCE_URL,
      pendingRequestId: REQUEST_ID,
    }),
  );

  const unsafeRow = JSON.parse(validMessage());
  unsafeRow.rows[0].cookie = 'no';
  assert.throws(() =>
    parseHistoryMessage({
      data: JSON.stringify(unsafeRow),
      eventUrl: SOURCE_URL,
      pendingRequestId: REQUEST_ID,
    }),
  );

  const externalHref = JSON.parse(validMessage());
  externalHref.rows[0].href = 'https://example.test/title/81249836';
  assert.throws(() =>
    parseHistoryMessage({
      data: JSON.stringify(externalHref),
      eventUrl: SOURCE_URL,
      pendingRequestId: REQUEST_ID,
    }),
  );

  assert.throws(() =>
    parseHistoryMessage({
      data: 'x'.repeat(65_537),
      eventUrl: SOURCE_URL,
      pendingRequestId: REQUEST_ID,
    }),
  );
});

test('il collector legge solo etichetta visibile, h1 e massimo 50 righe osservate', () => {
  const rows = Array.from({ length: 55 }, (_, index) => ({
    querySelector(selector) {
      if (selector === '.col.date') return { textContent: `${index + 1}/9/26` };
      if (selector === '.col.title a') {
        return {
          textContent: `Titolo ${index + 1}`,
          getAttribute: () => `/title/${8_000_000 + index}`,
        };
      }
      return null;
    },
  }));
  const documentRef = {
    querySelector(selector) {
      if (selector === '#profileSelector .current-profile img') {
        return { getAttribute: () => 'Profilo visibile' };
      }
      if (selector === 'h1') return { textContent: 'Attività di visione' };
      return null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-uia="activity-row"]');
      return rows;
    },
  };

  const payload = collectHistory(documentRef, SOURCE_URL, 50, REQUEST_ID);
  assert.equal(payload.rows.length, 50);
  assert.deepEqual(Object.keys(payload).sort(), [
    'heading',
    'profileLabel',
    'requestId',
    'rows',
    'sourceUrl',
    'type',
    'v',
  ]);
  assert.deepEqual(Object.keys(payload.rows[0]).sort(), ['date', 'href', 'title']);
  assert.equal(JSON.stringify(payload).includes('outerHTML'), false);
});

test('l’iniezione è portabile, limitata e non installa listener nelle pagine login', () => {
  const source = buildCollectorInjection({ requestId: REQUEST_ID, maxRows: 20, attempts: 4, delayMs: 300 });
  assert.match(source, /activity-row/);
  assert.match(source, /history-42/);
  assert.doesNotMatch(source, /outerHTML|addEventListener|password|cookie/i);
  assert.match(source, /attemptsLeft/);
  assert.match(source, /ReactNativeWebView\.postMessage/);
});
