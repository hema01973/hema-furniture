// src/... — HemaV050: Hardened CSP reporting
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler }          from '@/lib/api';
import { logger }                    from '@/lib/logger';

// CSP violation report shape (https://www.w3.org/TR/CSP3/#violation-report)
interface CspReport {
  'csp-report'?: {
    'document-uri'?:        string;
    'violated-directive'?:  string;
    'effective-directive'?: string;
    'blocked-uri'?:         string;
    'source-file'?:         string;
    'line-number'?:         number;
    'column-number'?:       number;
    'status-code'?:         number;
    'original-policy'?:     string;
  };
}

/**
 * Sanitizes strings to prevent log injection attacks.
 * Removes newlines and limits length.
 */
function sanitize(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]/g, ' ').substring(0, 500);
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    // 1. Validate Content-Type (V045)
    const contentType = req.headers.get('content-type');
    if (!contentType || (!contentType.includes('application/json') && !contentType.includes('application/csp-report'))) {
      return new NextResponse('Invalid Content-Type', { status: 415 });
    }

    let report: CspReport = {};
    try {
      report = await req.json() as CspReport;
    } catch {
      return NextResponse.json({}, { status: 204 });
    }

    const r = report['csp-report'];
    if (r) {
      // 2. Sanitize incoming JSON to prevent log-injection (V045)
      logger.warn('[CSP] Violation reported', {
        documentUri:        sanitize(r['document-uri']),
        violatedDirective:  sanitize(r['violated-directive'] ?? r['effective-directive']),
        blockedUri:         sanitize(r['blocked-uri']),
        sourceFile:         sanitize(r['source-file']),
        lineNumber:         r['line-number'],
        columnNumber:       r['column-number'],
        statusCode:         r['status-code'],
      });
    }

    // 204 No Content — standard response for CSP report endpoints
    return NextResponse.json({}, { status: 204 });
  },
  // 3. Strict Rate-limiting (V045: reduced to 10/min to prevent log flooding)
  { rateMax: 10, rateWindow: 60 },
);
