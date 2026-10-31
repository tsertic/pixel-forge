import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// This deterministic demo uses the real MCP protocol. It is not an embedded AI model.
const client = new Client({ name: 'pixel-forge-demo', version: '1.0.0' });
const url = process.env.PIXEL_FORGE_URL ?? 'http://127.0.0.1:3210/mcp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content[0].text);
  return result;
}
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const before = JSON.parse((await call('pixel_get_project', {})).content[0].text);
  // Explicit command-line flag is required before replacing any existing art.
  if (!process.argv.includes('--replace')) {
    console.log('Demo replaces the canvas (undoable). Run: npm run demo -- --replace');
  } else {
    await call('pixel_draw', {
      projectId: before.id,
      operations: [{ type: 'new_project', name: 'Forest familiar', width: 32, height: 32 }],
      label: 'Demo · new 32 × 32 canvas',
    });
    const p = JSON.parse((await call('pixel_get_project', {})).content[0].text),
      colors = {
        o: '#27382b',
        d: '#6a383d',
        r: '#c26360',
        R: '#ed8a70',
        h: '#ffbd83',
        w: '#f4e3bd',
        s: '#c8b492',
        b: '#8e795b',
        g: '#5f8c5d',
        G: '#a9d181',
        e: '#25352a',
      };
    const phases = [
      {
        label: 'Demo · mushroom cap silhouette',
        x: 5,
        y: 4,
        rows: [
          '.........oooo.........',
          '......oooRRRRooo......',
          '....ooRRRRRRRRRRoo....',
          '...oRRRRRRRRRRRRRRo...',
          '..oRRRRRRRRRRRRRRRRo..',
          '.oRRRRRRRRRRRRRRRRRRo.',
          'oRRRRRRRRRRRRRRRRRRRRo',
          'oRRRRRRRRRRRRRRRRRRRRo',
          'oRRRRRRRRRRRRRRRRRRRRo',
          '.orrrrrrrrrrrrrrrrrro.',
          '..ooddddddddddddddoo..',
          '.....oooooooooooo.....',
        ],
      },
      {
        label: 'Demo · stem and face',
        x: 11,
        y: 15,
        rows: [
          '...owwwwo...',
          '..owwwwwwo..',
          '..owwwwwwo..',
          '.owwwwwwwwo.',
          '.owwewwewwo.',
          '.owwwwwwwwo.',
          '.owwwbbwwwo.',
          '..owwwwwwwo.',
          '..oswwwwwso.',
          '..osssssso..',
          '...oooooo...',
        ],
      },
      {
        label: 'Demo · spots and highlights',
        x: 7,
        y: 6,
        rows: [
          '.......hhh........',
          '...ww..hh..ww.....',
          '..wwww....wwww....',
          '..wwww....wwww....',
          '...ww......ww.....',
          '..................',
          'ww......www.....ww',
          'ww.....wwwww....ww',
          '.......wwwww......',
          '........www.......',
        ],
      },
      {
        label: 'Demo · grass and details',
        x: 5,
        y: 23,
        rows: [
          '..g...............g...',
          '..gG..g.......g..Gg...',
          '...gG.gG.....Gg.Gg....',
          '....gGGgoooooGGGg.....',
          '.....gggGGGGGggg......',
        ],
      },
    ];
    for (const phase of phases) {
      await call('pixel_paint_sprite', { projectId: p.id, ...phase, colors });
      console.log(phase.label);
      await sleep(650);
    }
    await call('pixel_draw', {
      projectId: p.id,
      operations: [
        {
          type: 'settings',
          palette: [
            '#27382b',
            '#6a383d',
            '#c26360',
            '#ed8a70',
            '#ffbd83',
            '#f4e3bd',
            '#c8b492',
            '#8e795b',
            '#5f8c5d',
            '#a9d181',
            '#25352a',
            '#ffffff',
          ],
        },
      ],
      label: 'Demo · forest sprite palette',
    });
    console.log('MCP demo complete. Watch the editor at ' + url.replace(/\/mcp$/, ''));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
