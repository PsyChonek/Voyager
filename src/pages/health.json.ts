import live from '../../public/data/live.json';

export const prerender = true;

export function GET() {
  return new Response(
    JSON.stringify({ status: 'ok', build: new Date().toISOString(), data: live.generated }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
