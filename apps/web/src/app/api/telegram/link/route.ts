import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@devradar/db';
import { globalIpLimit } from '@/lib/limits';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/telegram/link → one-time code for the bot's /start.
 * The bot consumes the code and binds the chat (worker, grammY).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const code = randomBytes(6).toString('hex');
  await prisma.user.update({ where: { id: user.id }, data: { tgLinkCode: code } });

  const botName = process.env.TELEGRAM_BOT_NAME ?? 'DevRadarBot';
  return NextResponse.json({
    code,
    command: `/start ${code}`,
    botUrl: `https://t.me/${botName}?start=${code}`,
    linked: user.tgChatId !== null,
  });
}
