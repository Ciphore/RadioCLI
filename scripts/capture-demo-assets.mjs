#!/usr/bin/env node
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const root = fileURLToPath(new URL('..', import.meta.url));
const distCli = join(root, 'dist', 'cli.js');
const demoRoot = join(root, '.tmp', 'radiocli-demo-assets');
const demoHome = join(demoRoot, 'home');
const tapeDir = join(demoRoot, 'tapes');
const outputDir = join(root, 'apps', 'docs', 'public', 'demo');

const baseTape = [
  'Set Shell "bash"',
  'Set FontFamily "Menlo"',
  'Set FontSize 16',
  'Set Width 1280',
  'Set Height 760',
  'Set Padding 16',
  'Set Framerate 12',
  'Set WindowBar Rings',
  'Set Theme "TokyoNight"',
  'Set TypingSpeed 24ms'
];

const launchCommand = `cd ${shellEscape(root)} && RADIOCLI_HOME=${shellEscape(demoHome)} node dist/cli.js`;

const tapes = [
  {
    name: 'radiocli-now-playing',
    output: 'apps/docs/public/demo/radiocli-now-playing.gif',
    steps: [
      'Hide',
      `Type "${escapeTapeString(launchCommand)}"`,
      'Enter',
      'Sleep 1s',
      'Type "2"',
      'Sleep 500ms',
      'Enter',
      'Sleep 5s',
      'Left',
      'Sleep 1s',
      'Show',
      'Sleep 1s',
      'Type "v"',
      'Sleep 1100ms',
      'Type "v"',
      'Sleep 1100ms',
      'Type "v"',
      'Sleep 1100ms',
      'Type "v"',
      'Sleep 1100ms',
      'Type "t"',
      'Sleep 1s',
      'Type "t"',
      'Sleep 1s',
      'Type "v"',
      'Sleep 1100ms',
      'Type "t"',
      'Sleep 1s',
      'Ctrl+C'
    ]
  },
  {
    name: 'radiocli-library',
    output: 'apps/docs/public/demo/radiocli-library.gif',
    steps: [
      'Hide',
      `Type "${escapeTapeString(launchCommand)}"`,
      'Enter',
      'Sleep 1s',
      'Type "2"',
      'Sleep 500ms',
      'Show',
      'Sleep 1s',
      'Down',
      'Sleep 700ms',
      'Down',
      'Sleep 700ms',
      'Down',
      'Sleep 1s',
      'Ctrl+C'
    ]
  },
  {
    name: 'radiocli-explore-map',
    output: 'apps/docs/public/demo/radiocli-explore-map.gif',
    steps: [
      'Hide',
      `Type "${escapeTapeString(launchCommand)}"`,
      'Enter',
      'Sleep 1s',
      'Type "3"',
      'Sleep 3s',
      'Show',
      'Sleep 2s',
      'Type "D"',
      'Sleep 600ms',
      'Type "D"',
      'Sleep 2s',
      'Ctrl+C'
    ]
  },
  {
    name: 'radiocli-search',
    output: 'apps/docs/public/demo/radiocli-search.gif',
    steps: [
      'Hide',
      `Type "${escapeTapeString(launchCommand)}"`,
      'Enter',
      'Sleep 1s',
      'Show',
      'Type "4"',
      'Sleep 500ms',
      'Type "tokyo jazz"',
      'Sleep 500ms',
      'Enter',
      'Sleep 2500ms',
      'Down',
      'Sleep 600ms',
      'Down',
      'Sleep 1s',
      'Ctrl+C'
    ]
  },
  {
    name: 'radiocli-nearby',
    output: 'apps/docs/public/demo/radiocli-nearby.gif',
    steps: [
      'Hide',
      `Type "${escapeTapeString(launchCommand)}"`,
      'Enter',
      'Sleep 1s',
      'Type "6"',
      'Sleep 7s',
      'Show',
      'Sleep 2s',
      'Down',
      'Sleep 600ms',
      'Down',
      'Sleep 1s',
      'Ctrl+C'
    ]
  },
  {
    name: 'radiocli-stats-colors',
    output: 'apps/docs/public/demo/radiocli-stats-colors.gif',
    steps: [
      'Hide',
      `Type "${escapeTapeString(launchCommand)}"`,
      'Enter',
      'Sleep 1s',
      'Type "7"',
      'Sleep 500ms',
      'Type "t"',
      'Sleep 300ms',
      'Type "t"',
      'Sleep 300ms',
      'Show',
      'Sleep 1200ms',
      'Type "t"',
      'Sleep 1200ms',
      'Type "t"',
      'Sleep 1200ms',
      'Type "t"',
      'Sleep 1200ms',
      'Ctrl+C'
    ]
  }
];

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  requireCommand('vhs');
  requireCommand('magick');

  if (!existsSync(distCli)) {
    run('npm', ['run', 'build', '--silent']);
  }

  rmSync(demoRoot, {force: true, recursive: true});
  mkdirSync(demoHome, {recursive: true});
  mkdirSync(tapeDir, {recursive: true});
  mkdirSync(outputDir, {recursive: true});

  process.env.RADIOCLI_HOME = demoHome;
  writeSeedStore();
  await warmProviderCache();

  const selectedTapeNames = new Set(process.argv.slice(2));
  const selectedTapes = selectedTapeNames.size > 0
    ? tapes.filter(tape => selectedTapeNames.has(tape.name))
    : tapes;
  if (selectedTapes.length === 0) {
    throw new Error(`No matching demo tapes: ${Array.from(selectedTapeNames).join(', ')}`);
  }

  for (const tape of selectedTapes) {
    writeSeedStore();
    const tapePath = join(tapeDir, `${tape.name}.tape`);
    const content = [`Output "${tape.output}"`, ...baseTape, ...tape.steps].join('\n') + '\n';
    writeFileSync(tapePath, content, 'utf8');
    run('vhs', [tapePath]);
  }

  if (selectedTapeNames.size === 0 || selectedTapeNames.has('radiocli-now-playing')) {
    run('magick', [
      `${join(outputDir, 'radiocli-now-playing.gif')}[0]`,
      join(outputDir, 'radiocli-fullscreen.png')
    ]);
  }
}

function writeSeedStore() {
  const now = new Date();
  const stations = [
    station('groove-salad', 'SomaFM Groove Salad', 'United States', 'California', 'San Francisco', ['ambient', 'downtempo', 'electronic'], 37.7749, -122.4194),
    station('tokyo-jazz', 'Tokyo Jazz Sakura', 'Japan', 'Tokyo', 'Tokyo', ['jazz', 'city pop', 'night'], 35.6762, 139.6503),
    station('bbc-6', 'BBC Radio 6 Music', 'United Kingdom', 'England', 'London', ['alternative', 'indie', 'bbc'], 51.5072, -0.1276),
    station('radio-nova', 'Radio Nova Paris', 'France', 'Ile-de-France', 'Paris', ['funk', 'soul', 'world'], 48.8566, 2.3522),
    station('kcrw', 'KCRW Eclectic24', 'United States', 'California', 'Santa Monica', ['eclectic', 'public radio'], 34.0195, -118.4912)
  ];

  const recent = stations.slice(0, 4).map((item, index) => ({
    station: item,
    playedAt: new Date(now.getTime() - index * 86_400_000).toISOString()
  }));

  const sessions = buildDemoListeningSessions(now, stations);

  const state = {
    recent,
    favorites: [stations[0], stations[1], stations[3]],
    imported: stations,
    activity: {sessions},
    settings: {
      theme: 'green',
      receiverStyle: 'pulse-grid',
      receiverStyleVersion: 2,
      volume: 0,
      enableRadioGarden: false,
      enableNearbyLocation: true,
      preferredBackend: 'auto',
      tuneTimeoutSeconds: 12,
      skipBrokenStreams: true,
      mediaKeys: {
        previous: [],
        playPause: [],
        next: []
      }
    }
  };

  const storePath = join(demoHome, 'radiocli.json');
  mkdirSync(dirname(storePath), {recursive: true});
  writeFileSync(storePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function buildDemoListeningSessions(now, stations) {
  const sessions = [];
  const addSession = (daysAgo, stationIndex, listenedSeconds, hour = 19) => {
    const startedAt = new Date(now.getTime() - daysAgo * 86_400_000);
    startedAt.setHours(hour, 15 + (daysAgo % 3) * 10, 0, 0);
    const station = stations[stationIndex % stations.length];
    sessions.push({
      id: `${startedAt.toISOString()}-${station.id}-${sessions.length}`,
      station,
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + listenedSeconds * 1000).toISOString(),
      listenedSeconds
    });
  };

  const sparseDays = [252, 245, 236, 189, 181, 130, 119, 111, 96, 87];
  for (const [index, daysAgo] of sparseDays.entries()) {
    addSession(daysAgo, index, 900 + (index % 4) * 600, 18);
  }

  for (let daysAgo = 112; daysAgo >= 0; daysAgo -= 1) {
    const week = Math.floor(daysAgo / 7);
    const day = daysAgo % 7;
    const inFirstRecentCluster = daysAgo <= 112 && daysAgo >= 84 && day !== 0;
    const inSecondRecentCluster = daysAgo <= 72 && daysAgo >= 30 && day !== 6;
    const inFinalCluster = daysAgo <= 24;
    const bridgeDay = [80, 79, 54, 53, 52, 45, 38, 37].includes(daysAgo);
    const active = inFirstRecentCluster || inSecondRecentCluster || inFinalCluster || bridgeDay;
    if (!active) {
      continue;
    }

    const level = 1 + ((week + day * 2 + (daysAgo % 5)) % 4);
    const listenedSeconds = [900, 2400, 4200, 6600][level - 1] ?? 900;
    addSession(daysAgo, daysAgo, listenedSeconds, 17 + (day % 4));

    if ((daysAgo + day) % 9 === 0) {
      addSession(daysAgo, daysAgo + 1, Math.round(listenedSeconds * 0.55), 21);
    }
  }

  return sessions;
}

function station(id, name, country, state, city, tags, latitude, longitude) {
  return {
    id,
    provider: 'playlist',
    name,
    country,
    countryCode: countryCodeFor(country),
    state,
    city,
    language: 'english',
    languageCodes: ['en'],
    tags,
    codec: 'MP3',
    bitrate: 128,
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    latitude,
    longitude,
    lastCheckedOk: true
  };
}

function countryCodeFor(country) {
  return {
    France: 'FR',
    Japan: 'JP',
    'United Kingdom': 'GB',
    'United States': 'US'
  }[country];
}

async function warmProviderCache() {
  const {ProviderManager} = await import('../dist/providers/provider-manager.js');
  const providers = new ProviderManager();
  const settings = {
    theme: 'green',
    receiverStyle: 'pulse-grid',
    volume: 0,
    enableRadioGarden: false,
    enableNearbyLocation: true,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: {previous: [], playPause: [], next: []}
  };

  await providers.nearby({latitude: 48.8566, longitude: 2.3522, source: 'demo'}, 90);
  await providers.search('tokyo jazz', settings, {limit: 90});
  await providers.countries(80);
}

function requireCommand(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${shellEscape(command)}`], {
    stdio: 'ignore'
  });

  if (result.status !== 0) {
    throw new Error(`Missing required command: ${command}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {...process.env, RADIOCLI_HOME: demoHome},
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
}

function shellEscape(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function escapeTapeString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
