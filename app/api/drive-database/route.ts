import { NextResponse } from 'next/server';

import type { DriveDatabase } from '@/app/(interface)/components/right-sidebar/data-sources/googleDrive';
import driveDatabase from '@/app/(database)/drive-database.json';

const cachedDatabase = driveDatabase as DriveDatabase;

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(cachedDatabase);
}
