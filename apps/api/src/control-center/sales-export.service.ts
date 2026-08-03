import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import type { SalesReportQueryDto } from './dto/sales-backoffice-query.dto';
import { SalesBackofficeService } from './sales-backoffice.service';

type CsvCell = string | number;

@Injectable()
export class SalesExportService {
  constructor(private readonly sales: SalesBackofficeService) {}

  async csv(auth: AuthContext, query: SalesReportQueryDto) {
    const report = await this.sales.report(auth, query);
    const rows: CsvCell[][] = [
      ['section', 'location', 'payment_method', 'orders', 'pos_revenue_cents'],
      ...report.byLocation.map<CsvCell[]>((row) => [
        'by_location',
        row.locationName,
        '',
        row.orders,
        row.posRevenueCents,
      ]),
      ...report.byMethod.map<CsvCell[]>((row) => [
        'by_payment_method',
        '',
        row.method,
        row.orders,
        row.posRevenueCents,
      ]),
      [],
      ['booking_deposits', '', '', '', report.totals.bookingDepositsCents],
    ];

    return rows
      .map((row) => row.map((value) => this.cell(value)).join(','))
      .join('\n');
  }

  private cell(value: CsvCell) {
    const text = typeof value === 'number' ? value.toString() : value;
    return `"${text.replaceAll('"', '""')}"`;
  }
}
