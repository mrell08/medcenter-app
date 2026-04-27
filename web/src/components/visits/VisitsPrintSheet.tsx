import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import dayjs from 'dayjs'
import type { VisitResponse } from '../../api'
import type { PrintColumnKey } from './printConsts'
import { PRINT_HEADERS } from './printConsts'


type ClientExtra = { full_name: string; phone_number?: string | null; date_of_birth?: string | null }
type DoctorExtra = { full_name: string; speciality?: string | null }
export type PrintEmptyRow = {
    __empty: true
    id: string
    start_date: string
    end_date: string
    doctor_id: string
    doctor_name: string
}
export type PrintSheetRow = VisitResponse | PrintEmptyRow

type Props = {
    title?: string
    subtitle?: string
    note?: string
    columns: PrintColumnKey[]
    data: PrintSheetRow[]
    clientsMap?: Record<string, ClientExtra>   // key = client_id
    doctorsMap?: Record<string, DoctorExtra>   // key = doctor_id
}

function isEmptyRow(row: PrintSheetRow): row is PrintEmptyRow {
    return '__empty' in row && row.__empty === true
}

function ageYears(iso?: string | null): string | undefined {
    if (!iso) return undefined
    const birth = dayjs(iso)
    if (!birth.isValid()) return undefined
    // const now = dayjs()
    // let age = now.year() - birth.year()
    // if (now.dayOfYear() < birth.dayOfYear()) age -= 1
    const age = dayjs().diff(birth, 'year')
    return String(age)
}

function clientCell(v: VisitResponse, extra?: ClientExtra): string {
    if (!extra) return v.client_name
    const tail: string[] = []
    if (extra.phone_number) tail.push(extra.phone_number)
    const age = ageYears(extra.date_of_birth)
    if (age) tail.push(`${age} лет`)
    return tail.length ? `${extra.full_name} ${tail.join(' ')}` : extra.full_name
}

function doctorCell(v: VisitResponse, extra?: DoctorExtra): string {
    if (!extra) return v.doctor_name
    return extra.speciality ? `${extra.full_name} — ${extra.speciality}` : extra.full_name
}

function formatTimeRange(startISO: string, endISO?: string | null): string {
    const start = dayjs(startISO)
    const end = endISO ? dayjs(endISO) : start
    const safeEnd = end.isValid() ? end : start
    return `${start.format('HH:mm')}–${safeEnd.format('HH:mm')}`
}

function cell(
    col: PrintColumnKey,
    row: PrintSheetRow,
    clientsMap?: Record<string, ClientExtra>,
    doctorsMap?: Record<string, DoctorExtra>
): string {
    if (isEmptyRow(row)) {
        switch (col) {
            case 'date': return dayjs(row.start_date).format('DD.MM.YYYY')
            case 'time': return formatTimeRange(row.start_date, row.end_date)
            case 'doctor': return doctorsMap?.[row.doctor_id]?.full_name ?? row.doctor_name
            case 'client':
            case 'cabinet':
            case 'procedure':
            case 'status':
            case 'cost':
                return ''
        }
    }

    const v = row
    switch (col) {
        case 'date': return dayjs(v.start_date).format('DD.MM.YYYY')
        case 'time': return formatTimeRange(v.start_date, v.end_date)
        case 'client': return clientCell(v, clientsMap?.[v.client_id])
        case 'doctor': return doctorCell(v, doctorsMap?.[v.doctor_id])
        case 'cabinet': return v.cabinet ?? '—'
        case 'procedure': return v.procedure ?? '—'
        case 'status': return v.status
        case 'cost': return v.cost != null ? String(v.cost) : '—'
    }
}

const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', fontSize: 12 }
const cellBaseStyle: CSSProperties = { padding: '6px 8px', textAlign: 'left', boxSizing: 'border-box', verticalAlign: 'top' }
const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 700, margin: 0 }
const subtitleStyle: CSSProperties = { fontSize: 14, margin: '2px 0 8px 0' }
const noteStyle: CSSProperties = { fontSize: 12, color: '#555', margin: '0 0 12px 0' }

function gridCellStyle(rowIndex: number, colIndex: number, rowCount: number, colCount: number): CSSProperties {
    return {
        ...cellBaseStyle,
        borderTop: '1px solid #777',
        borderLeft: '1px solid #777',
        ...(colIndex === colCount - 1 ? { borderRight: '1px solid #777' } : {}),
        ...(rowIndex === rowCount - 1 ? { borderBottom: '1px solid #777' } : {}),
    }
}

function headerCellStyle(colIndex: number, colCount: number): CSSProperties {
    return {
        ...cellBaseStyle,
        borderTop: '1px solid #777',
        borderLeft: '1px solid #777',
        borderBottom: '1px solid #777',
        ...(colIndex === colCount - 1 ? { borderRight: '1px solid #777' } : {}),
    }
}

const VisitsPrintSheet = forwardRef<HTMLDivElement, Props>(({ title, subtitle, note, columns, data, clientsMap, doctorsMap }, ref) => {
    return (
        <div ref={ref} style={{ padding: 16, color: '#000', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {title && <h1 style={titleStyle}>{title}</h1>}
            {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
            {note && <p style={noteStyle}>{note}</p>}

            <table style={tableStyle}>
                <thead>
                <tr>
                    {columns.map((c, colIndex) => (
                        <th key={c} style={headerCellStyle(colIndex, columns.length)}>{PRINT_HEADERS[c]}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {data.map((row, rowIndex) => (
                    <tr key={row.id}>
                        {columns.map((c, colIndex) => (
                            <td key={c} style={gridCellStyle(rowIndex, colIndex, data.length, columns.length)}>
                                {cell(c, row, clientsMap, doctorsMap)}
                            </td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
})

export default VisitsPrintSheet
