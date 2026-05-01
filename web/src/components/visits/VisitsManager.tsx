import {useCallback, useMemo, useState} from 'react'
import {
    Button,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Modal,
    Radio,
    Select,
    Space,
    Table,
    message,
    Popconfirm,
    Tooltip,
    Dropdown,
    Typography,
    Switch
} from 'antd'
import type {ColumnsType, ColumnType} from 'antd/es/table'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import dayjs, {Dayjs} from 'dayjs'
import {api} from '../../lib/api'
import type {
    ClientCreateRequest,
    ClientResponse,
    VisitCreateRequest,
    VisitResponse,
    VisitStatusEnum,
    VisitUpdateRequest,
} from '../../api'
import {
    createSchedule,
    deleteSchedule,
    fetchSchedule,
    updateSchedule,
    type ScheduleCreateRequest,
    type ScheduleResponse,
    type ScheduleUpdateRequest,
} from '../../api/schedules'
import {fetchVisits, type VisitPageResponse, type VisitQueryParams} from '../../api/visits'
import {getErrorMessage} from '../../lib/errors'
import EntitySelect from '../EntitySelect'
import {Info, Pencil, Trash2} from 'lucide-react'
import {useNavigate, useLocation} from 'react-router-dom'
import EntityLink from '../EntityLink'
import {TimePicker} from 'antd' // <- используем нормальный тайм-пикер
import axios from 'axios'

import {Modal as AntModal, Checkbox} from 'antd'
import type {CheckboxChangeEvent} from 'antd/es/checkbox'
import {Printer} from 'lucide-react'
import {useReactToPrint} from 'react-to-print'
import type {PrintColumnKey} from './printConsts'
import {PRINT_HEADERS} from './printConsts'

import {useEffect, useRef} from 'react'
import VisitsPrintSheet, { type PrintSheetRow } from "./VisitsPrintSheet.tsx";
import { formatPhoneInput, formatPhoneNumber, normalizePhoneNumber } from '../../lib/phone'

type DoctorMini = { id: string; full_name: string; speciality: string }
type ClientMini = { id: string; full_name: string; phone_number?: string | null; date_of_birth?: string | null }

async function fetchDoctorMini(id: string): Promise<DoctorMini> {
    const r = await api.get<DoctorMini>(`/doctors/${id}`)
    return r.data
}

async function fetchClientMini(id: string): Promise<ClientMini> {
    const r = await api.get<ClientMini>(`/clients/${id}`)
    return r.data
}

async function createClient(body: ClientCreateRequest): Promise<ClientResponse> {
    const r = await api.post<ClientResponse>('/clients/', body)
    return r.data
}

const {RangePicker} = DatePicker
const STATUS: VisitStatusEnum[] = ['UNCONFIRMED', 'CONFIRMED', 'PAID']
const STATUS_META: Record<VisitStatusEnum, { emoji: string; label: string }> = {
    UNCONFIRMED: {emoji: '❌', label: 'Не подтверждён'},
    CONFIRMED: {emoji: '✅', label: 'Подтверждён'},
    PAID: {emoji: '💠', label: 'Оплачен'},
}
const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 60] as const
type DurationMin = typeof DURATIONS[number]
type PatientMode = 'existing' | 'new'
type GapRow = {
    __gap: true
    id: string
    start_date: string
    end_date: string
}
type SlotRow = {
    __slot: true
    id: string
    start_date: string
    end_date: string
    durationMinutes: number
}
type RowData = VisitResponse | GapRow | SlotRow

type VisitFormValues = {
    // ids
    client_id?: string
    doctor_id?: string
    patient_mode?: PatientMode
    client_full_name?: string
    client_phone_number?: string
    client_date_of_birth?: Dayjs | null
    // дата/время для UI
    date?: Dayjs | null
    time_start?: Dayjs | null
    duration?: DurationMin | null
    // прочие поля
    status?: VisitStatusEnum
    procedure?: string
    cabinet?: string
    cost?: number
}

type ScheduleFormValues = {
    start_time?: Dayjs
    end_time?: Dayjs
    duration?: DurationMin
}

type ShowColumns = Partial<{
    date: boolean
    startTime: boolean
    endTime: boolean
    client: boolean
    doctor: boolean
    procedure: boolean
    cabinet: boolean
    cost: boolean
    status: boolean
    actions: boolean
}>

type Context = {
    clientId?: string
    doctorId?: string
}

type Props = {
    context?: Context
    show?: ShowColumns
    defaultLimit?: number
    onTotalsChange?: () => void
}

function isGap(row: unknown): row is GapRow {
    return typeof row === 'object' && row !== null && '__gap' in row && (row as GapRow).__gap
}

function isSlot(row: unknown): row is SlotRow {
    return typeof row === 'object' && row !== null && '__slot' in row && (row as SlotRow).__slot
}

function combineDateAndTime(date: Dayjs, time: Dayjs): string {
    return date
        .hour(time.hour())
        .minute(time.minute())
        .second(0)
        .millisecond(0)
        .toISOString()
}

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
})

function formatCurrency(value: number): string {
    return currencyFormatter.format(value)
}

async function createVisit(body: VisitCreateRequest): Promise<VisitResponse> {
    const res = await api.post<VisitResponse>('/visits/', body)
    return res.data
}

async function updateVisit(id: string, body: VisitUpdateRequest): Promise<VisitResponse> {
    const res = await api.patch<VisitResponse>(`/visits/${id}`, body)
    return res.data
}

async function deleteVisit(id: string): Promise<void> {
    await api.delete(`/visits/${id}`)
}

export default function VisitsManager({context, show, defaultLimit = 30, onTotalsChange}: Props) {
    const qc = useQueryClient()
    const navigate = useNavigate()
    const location = useLocation()
    const didHydrateFromUrl = useRef(false)

    const notifyTotalsChange = useCallback(() => {
        onTotalsChange?.()
    }, [onTotalsChange])

    // -------- Фильтры списка --------
    const [clientId, setClientId] = useState<string | undefined>(context?.clientId)
    const [doctorId, setDoctorId] = useState<string | undefined>(context?.doctorId)
    const [status, setStatus] = useState<VisitStatusEnum | undefined>()
    const [day, setDay] = useState<Dayjs | null>(null)
    const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
    const [cabinet, setCabinet] = useState<string | undefined>()
    const [procedure, setProcedure] = useState<string | undefined>()
    const [limit, setLimit] = useState<number>(defaultLimit)
    const isDayMode = !!day && !range
    const effDoctorId = context?.doctorId ?? doctorId
    const isDoctorDayMode = isDayMode && !!effDoctorId

    const [page, setPage] = useState<number>(1)
    const [pageSize, setPageSize] = useState<number>(defaultLimit)

    useEffect(() => {
        if (didHydrateFromUrl.current) return
        const sp = new URLSearchParams(location.search)

        const qClient = sp.get('client_id') || undefined
        const qDoctor = sp.get('doctor_id') || undefined
        const qStatus = sp.get('status') as VisitStatusEnum | null
        const qCab = sp.get('cabinet') || undefined
        const qProc = sp.get('procedure') || undefined
        const qPage = sp.get('page')
        const qLimit = sp.get('limit')
        const qDay = sp.get('day')
        const qStart = sp.get('start')
        const qEnd = sp.get('end')

        if (!context?.clientId && qClient) setClientId(qClient)
        if (!context?.doctorId && qDoctor) setDoctorId(qDoctor)
        if (qStatus && ['UNCONFIRMED', 'CONFIRMED', 'PAID'].includes(qStatus)) setStatus(qStatus)
        if (qCab) setCabinet(qCab)
        if (qProc) setProcedure(qProc)
        if (qLimit && !Number.isNaN(Number(qLimit))) setLimit(Number(qLimit))

        if (qPage && !Number.isNaN(Number(qPage))) setPage(Math.max(1, Number(qPage)))
        if (qLimit && !Number.isNaN(Number(qLimit))) {
            setLimit(Number(qLimit))
            setPageSize(Number(qLimit))
        }

        if (qDay) {
            const d = dayjs(qDay, 'DD.MM.YYYY', true)
            if (d.isValid()) {
                setDay(d)
                setRange(null)
            }
        } else if (qStart && qEnd) {
            const s = dayjs(qStart)
            const e = dayjs(qEnd)
            if (s.isValid() && e.isValid()) {
                setRange([s, e])
                setDay(null)
            }
        }

        didHydrateFromUrl.current = true
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])


    // === Минимум/максимум времени из env ===
    const MIN_TIME = (import.meta.env.VITE_MIN_TIME as string) || '06:30'
    const MAX_TIME = (import.meta.env.VITE_MAX_TIME as string) || '21:30'

    const parseHHMM = useCallback((s: string): { h: number; m: number } => {
        const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim())
        if (!m) return {h: 0, m: 0}
        return {h: Number(m[1]), m: Number(m[2])}
    }, [])

    const parseHHMMSS = useCallback((s: string): { h: number; m: number; s: number } => {
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((s ?? '').trim())
        if (!m) return {h: 0, m: 0, s: 0}
        return {h: Number(m[1]), m: Number(m[2]), s: m[3] ? Number(m[3]) : 0}
    }, [])

    const parseDurationMinutes = useCallback((s: string): number => {
        const trimmed = (s ?? '').trim()

        // Поддерживаем ISO-8601 длительности, например "PT10M", "P1DT2H30M"
        const isoMatch = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(trimmed)
        if (isoMatch) {
            const days = Number(isoMatch[1] ?? 0)
            const hours = Number(isoMatch[2] ?? 0)
            const minutes = Number(isoMatch[3] ?? 0)
            const seconds = Number(isoMatch[4] ?? 0)
            return days * 24 * 60 + hours * 60 + minutes + Math.floor(seconds / 60)
        }

        // Поддерживаем формат "HH:MM:SS" и варианты вида "1 day, 02:00:00"
        const match = /(?:(\d+)\s+day[s]?,\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed)
        if (!match) return 0
        const days = Number(match[1] ?? 0)
        const hours = Number(match[2] ?? 0)
        const minutes = Number(match[3] ?? 0)
        const seconds = Number(match[4] ?? 0)
        return days * 24 * 60 + hours * 60 + minutes + Math.floor(seconds / 60)
    }, [])

    const toDurationString = useCallback((minutes: number): string => {
        const safeMinutes = Math.max(0, Math.floor(minutes))
        const days = Math.floor(safeMinutes / (24 * 60))
        const remainderAfterDays = safeMinutes % (24 * 60)
        const hrs = Math.floor(remainderAfterDays / 60)
        const mins = remainderAfterDays % 60

        const parts = [] as string[]
        if (hrs) parts.push(`${hrs}H`)
        if (mins || (!hrs && !days)) parts.push(`${mins}M`)

        return `P${days ? `${days}D` : ''}T${parts.join('')}`
    }, [])

    function disabledHoursForWorkday() {
        const arr: number[] = []
        for (let h = 0; h < 24; h++) {
            if (h < 6 || h > 22) arr.push(h) // разрешаем 6..22 включительно
        }
        return arr
    }

    // === Построение строк дня с «щелями» ===
    const buildDayRows = useCallback((day: Dayjs, visits: VisitResponse[], minTime: string, maxTime: string): RowData[] => {
        const {h: minH, m: minM} = parseHHMM(minTime)
        const {h: maxH, m: maxM} = parseHHMM(maxTime)

        const dayMin = day.startOf('day').hour(minH).minute(minM).second(0).millisecond(0)
        const dayMax = day.startOf('day').hour(maxH).minute(maxM).second(0).millisecond(0)

        const sorted = [...(visits || [])].sort((a, b) =>
            dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf()
        )

        if (sorted.length === 0) {
            return [{
                __gap: true,
                id: `gap-${dayMin.toISOString()}-${dayMax.toISOString()}`,
                start_date: dayMin.toISOString(),
                end_date: dayMax.toISOString(),
            }]
        }

        const rows: RowData[] = []
        let cursor = dayMin
        for (const v of sorted) {
            const vs = dayjs(v.start_date)
            const ve = v.end_date ? dayjs(v.end_date) : vs
            if (vs.isAfter(cursor)) {
                rows.push({
                    __gap: true,
                    id: `gap-${cursor.toISOString()}-${vs.toISOString()}`,
                    start_date: cursor.toISOString(),
                    end_date: vs.toISOString(),
                })
            }
            rows.push(v)
            if (ve.isAfter(cursor)) cursor = ve
        }
        if (dayMax.isAfter(cursor)) {
            rows.push({
                __gap: true,
                id: `gap-${cursor.toISOString()}-${dayMax.toISOString()}`,
                start_date: cursor.toISOString(),
                end_date: dayMax.toISOString(),
            })
        }
        return rows
    }, [parseHHMM])

    const buildScheduleRows = useCallback((day: Dayjs, visits: VisitResponse[], schedule: ScheduleResponse): RowData[] => {
        const durationMinutes = parseDurationMinutes(schedule.duration)
        if (!durationMinutes || durationMinutes <= 0) return visits

        const {h: startH, m: startM, s: startS} = parseHHMMSS(schedule.start_time)
        const {h: endH, m: endM, s: endS} = parseHHMMSS(schedule.end_time)

        const dayStart = day.startOf('day').hour(startH).minute(startM).second(startS).millisecond(0)
        const dayEnd = day.startOf('day').hour(endH).minute(endM).second(endS).millisecond(0)

        if (!dayEnd.isAfter(dayStart)) return visits

        const sortedVisits = [...visits].sort((a, b) =>
            dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf()
        )

        const getVisitRange = (visit: VisitResponse) => {
            const start = dayjs(visit.start_date).millisecond(0)
            const end = visit.end_date ? dayjs(visit.end_date).millisecond(0) : start
            return {start, end}
        }

        const rows: RowData[] = []
        let cursor = dayStart
        let visitIdx = 0
        let guard = 0

        while (cursor.isBefore(dayEnd) && guard < 10_000) {
            const slotEnd = cursor.add(durationMinutes, 'minute')
            let overlappingVisit: VisitResponse | undefined

            while (visitIdx < sortedVisits.length) {
                const visit = sortedVisits[visitIdx]
                const {start, end} = getVisitRange(visit)

                if (end.isBefore(cursor) || end.isSame(cursor)) {
                    visitIdx += 1
                    continue
                }

                if (start.isBefore(slotEnd) && end.isAfter(cursor)) {
                    overlappingVisit = visit
                }

                break
            }

            if (overlappingVisit) {
                rows.push(overlappingVisit)
                cursor = getVisitRange(overlappingVisit).end
            } else {
                rows.push({
                    __slot: true,
                    id: `slot-${cursor.toISOString()}`,
                    start_date: cursor.toISOString(),
                    end_date: slotEnd.toISOString(),
                    durationMinutes,
                })
                cursor = slotEnd
            }

            guard += 1
        }

        return rows
    }, [parseDurationMinutes, parseHHMMSS])

    type EditableField = 'procedure' | 'cost'

    const [editingCell, setEditingCell] = useState<{ id: string; field: EditableField } | null>(null)
    const [draftValue, setDraftValue] = useState<string | number | null>(null)

    const beginEdit = useCallback((v: VisitResponse, field: EditableField) => {
        setEditingCell({id: v.id, field})
        if (field === 'cost') {
            setDraftValue(typeof v.cost === 'number' ? v.cost : null)
        } else {
            setDraftValue(v.procedure ?? '')
        }
    }, [])

    const cancelEdit = useCallback(() => {
        setEditingCell(null)
        setDraftValue(null)
    }, [])

    const updateInlineMutate = useMutation({
        mutationFn: ({id, body}: { id: string; body: Partial<VisitUpdateRequest> }) =>
            updateVisit(id, body as VisitUpdateRequest),
        onSuccess: () => {
            message.success('Сохранено')
            qc.invalidateQueries({queryKey: ['visits']})
            notifyTotalsChange()
            cancelEdit()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const saveEdit = useCallback((v: VisitResponse) => {
        if (!editingCell) return
        const body: Partial<VisitUpdateRequest> =
            editingCell.field === 'cost'
                ? {cost: draftValue === '' || draftValue === null ? null : Number(draftValue)}
                : {procedure: draftValue === '' ? null : String(draftValue)}

        updateInlineMutate.mutate({id: v.id, body})
    }, [draftValue, editingCell, updateInlineMutate])

    const [printOpen, setPrintOpen] = useState(false)
    const [printCols, setPrintCols] = useState<PrintColumnKey[]>(
        context?.doctorId
            ? ['time', 'client', 'procedure', 'cost']      // дефолт для врача
            : context?.clientId
                ? ['date', 'time', 'doctor', 'procedure'] // дефолт для пациента
                : ['date', 'time', 'client', 'doctor', 'procedure', 'status', 'cost'] // общий
    )

    const [ignoreSchedule, setIgnoreSchedule] = useState(false)

    const [clientsMap, setClientsMap] = useState<Record<string, ClientMini>>({})
    const [doctorsMap, setDoctorsMap] = useState<Record<string, DoctorMini>>({})

    const printRef = useRef<HTMLDivElement>(null)

    const params: VisitQueryParams = useMemo(() => {
        const p: VisitQueryParams = {}
        if (isDoctorDayMode) {
            p.limit = 10000
            p.offset = 0
        } else {
            p.limit = pageSize
            p.offset = (page - 1) * pageSize
        }
        if (clientId) p.client_id = clientId
        if (doctorId) p.doctor_id = doctorId
        if (status) p.status = status
        if (cabinet) p.cabinet = cabinet
        if (procedure) p.procedure = procedure
        if (day) {
            p.start_date = day.startOf('day').toISOString()
            p.end_date = day.endOf('day').toISOString()
        } else if (range) {
            p.start_date = range[0].toISOString()
            p.end_date = range[1].toISOString()
        }
        return p
    }, [isDoctorDayMode, clientId, doctorId, status, cabinet, procedure, day, range, pageSize, page])

    const reserveParams: VisitQueryParams | null = useMemo(() => {
        if (!isDoctorDayMode || !day || !effDoctorId) return null
        return {
            limit: 10000,
            offset: 0,
            doctor_id: effDoctorId,
            start_date: day.startOf('day').toISOString(),
            end_date: day.endOf('day').toISOString(),
            reserve_list: true,
        }
    }, [day, effDoctorId, isDoctorDayMode])

    const scheduleDate = useMemo(() => day?.format('YYYY-MM-DD'), [day])

    const {
        data: scheduleData,
        isFetching: isScheduleLoading,
        isError: isScheduleError,
    } = useQuery<ScheduleResponse | null>({
        queryKey: ['schedule', scheduleDate, effDoctorId],
        enabled: isDoctorDayMode && !!scheduleDate && !!effDoctorId,
        queryFn: async () => {
            try {
                return await fetchSchedule(scheduleDate!, effDoctorId!)
            } catch (err: unknown) {
                if (axios.isAxiosError(err) && err.response?.status === 404) return null
                throw err
            }
        },
        retry: false,
    })

    const {data, isLoading} = useQuery<VisitPageResponse>({
        queryKey: ['visits', params],
        queryFn: () => fetchVisits(params),
    })

    const {
        data: reserveData,
        isLoading: isReserveLoading,
    } = useQuery<VisitPageResponse>({
        queryKey: ['visits', 'reserve', reserveParams],
        queryFn: () => fetchVisits(reserveParams!),
        enabled: !!reserveParams,
    })

    const scheduleTableData: RowData[] | null = useMemo(() => {
        if (!isDoctorDayMode || !scheduleData || !day) return null
        return buildScheduleRows(day, data?.items ?? [], scheduleData)
    }, [isDoctorDayMode, scheduleData, day, data?.items, buildScheduleRows])

    useEffect(() => {
        if (isScheduleError) {
            message.warning('Не удалось загрузить разлиновку, показываем обычный список')
        }
    }, [isScheduleError])

    const tableData: RowData[] = useMemo(() => {
        const items = data?.items ?? []
        if (scheduleTableData && !ignoreSchedule) return scheduleTableData
        if (!isDayMode) return items as RowData[]
        if (!day) return []
        return buildDayRows(day, items, MIN_TIME, MAX_TIME)
    }, [isDayMode, data, day, buildDayRows, MIN_TIME, MAX_TIME, scheduleTableData, ignoreSchedule])

    const totalCostValue = data?.total_cost ?? 0
    const totalCostDisplay = isLoading && !data
        ? 'Загрузка…'
        : `${formatCurrency(totalCostValue)} ₽`

    useEffect(() => {
        setPage(1)
    }, [clientId, doctorId, status, cabinet, procedure, day, range])

    useEffect(() => {
        if (!didHydrateFromUrl.current) return

        const sp = new URLSearchParams()

        if (!context?.clientId && clientId) sp.set('client_id', clientId)
        if (!context?.doctorId && doctorId) sp.set('doctor_id', doctorId)
        if (status) sp.set('status', status)
        if (cabinet) sp.set('cabinet', cabinet)
        if (procedure) sp.set('procedure', procedure)
        if (limit !== defaultLimit) sp.set('limit', String(limit))
        if (page !== 1) sp.set('page', String(page))
        if (pageSize !== defaultLimit) sp.set('limit', String(pageSize))

        if (day) {
            sp.set('day', day.format('DD.MM.YYYY'))
        } else if (range) {
            sp.set('start', range[0].toISOString())
            sp.set('end', range[1].toISOString())
        }

        const search = sp.toString()
        navigate({search: search ? `?${search}` : ''}, {replace: true})
    }, [clientId, doctorId, status, cabinet, procedure, day, range, limit, defaultLimit, navigate, context?.clientId, context?.doctorId, page, pageSize])

    useEffect(() => {
        if (!printOpen || !data) return

        const uniqueClients = Array.from(new Set(data.items.map(v => v.client_id)))
        const uniqueDoctorsSet = new Set(data.items.map(v => v.doctor_id))
        if (effDoctorId) uniqueDoctorsSet.add(effDoctorId)
        const uniqueDoctors = Array.from(uniqueDoctorsSet)

        ;(async () => {
            try {
                const [cPairs, dPairs] = await Promise.all([
                    Promise.all(uniqueClients.map(async (id) => [id, await fetchClientMini(id)] as const)),
                    Promise.all(uniqueDoctors.map(async (id) => [id, await fetchDoctorMini(id)] as const)),
                ])
                setClientsMap(Object.fromEntries(cPairs))
                setDoctorsMap(Object.fromEntries(dPairs))
            } catch {
                // тихо игнорируем — печать всё равно пройдёт с базовыми полями
            }
        })()
    }, [printOpen, data, effDoctorId])

    const printData: PrintSheetRow[] = useMemo(() => {
        const hasActiveScheduleLayout = !!scheduleTableData && !ignoreSchedule
        if (!isDoctorDayMode || !day || !effDoctorId || !hasActiveScheduleLayout) return data?.items ?? []

        const doctorName = doctorsMap[effDoctorId]?.full_name ?? 'Врач'
        return tableData.flatMap((row): PrintSheetRow[] => {
            if ('__gap' in row || '__slot' in row) {
                return [{
                    __empty: true,
                    id: row.id,
                    start_date: row.start_date,
                    end_date: row.end_date,
                    doctor_id: effDoctorId,
                    doctor_name: doctorName,
                }]
            }
            return [row]
        })
    }, [isDoctorDayMode, day, effDoctorId, data?.items, doctorsMap, ignoreSchedule, scheduleTableData, tableData])

    const printTitle =
        context?.doctorId ? (doctorsMap[context.doctorId!]?.full_name ?? 'Врач') :
            context?.clientId ? (clientsMap[context.clientId!]?.full_name ?? 'Пациент') :
                'Все приёмы'

    const printSubtitle =
        context?.doctorId ? (doctorsMap[context.doctorId!]?.speciality ?? '') :
            context?.clientId ? (() => {
                const c = clientsMap[context.clientId!]
                if (!c) return ''
                const dob = c.date_of_birth ? dayjs(c.date_of_birth).format('DD.MM.YYYY') : undefined
                const age = c.date_of_birth ? (() => {
                    const birth = dayjs(c.date_of_birth)
                    const a = dayjs().diff(birth, 'year')
                    return `${a} лет`
                })() : undefined
                const phone = formatPhoneNumber(c.phone_number)
                return [phone || undefined, dob && `рожд. ${dob}`, age].filter(Boolean).join(' · ')
            })() : ''

    const printNote = (() => {
        const parts: string[] = []
        if (day) parts.push(`День: ${day.format('DD.MM.YYYY')}`)
        else if (range) parts.push(`Период: ${range[0].format('DD.MM.YYYY HH:mm')} – ${range[1].format('DD.MM.YYYY HH:mm')}`)
        if (status) parts.push(`Статус: ${status}`)
        if (cabinet) parts.push(`Кабинет: ${cabinet}`)
        if (procedure) parts.push(`Услуга: ${procedure}`)
        return parts.join(' · ')
    })()

    const doPrint = useReactToPrint({
        contentRef: printRef,                               // ✅ вместо content
        documentTitle: `${printTitle} — приёмы`,
        pageStyle: '@page { size: auto; margin: 20mm; }',
        onAfterPrint: () => console.log('Печать завершена'),
        // preserveAfterPrint: false, // по умолчанию и так false
    })

    // -------- Модалка / форма --------
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<VisitResponse | null>(null)
    const [isReserveCreate, setIsReserveCreate] = useState(false)
    const [isReserveAssign, setIsReserveAssign] = useState(false)
    const [form] = Form.useForm<VisitFormValues>()
    const [scheduleForm] = Form.useForm<ScheduleFormValues>()
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
    const [isScheduleEdit, setIsScheduleEdit] = useState(false)
    const patientMode = Form.useWatch('patient_mode', form) ?? 'existing'

    const openReserveAssign = useCallback((v: VisitResponse) => {
        setEditing(v)
        setIsReserveCreate(false)
        setIsReserveAssign(true)
        setOpen(true)
        form.resetFields()
        form.setFieldsValue({
            patient_mode: 'existing',
            client_id: context?.clientId ?? v.client_id,
            doctor_id: context?.doctorId ?? v.doctor_id,
            date: dayjs(v.start_date),
            duration: 10,
        })
    }, [context?.clientId, context?.doctorId, form])

    const openSlotForm = useCallback((slot: SlotRow) => {
        const start = dayjs(slot.start_date)
        setEditing(null)
        setOpen(true)
        form.resetFields()
        const maybeDuration = DURATIONS.includes(slot.durationMinutes as DurationMin)
            ? (slot.durationMinutes as DurationMin)
            : undefined
        form.setFieldsValue({
            patient_mode: 'existing',
            client_id: context?.clientId,
            doctor_id: context?.doctorId ?? effDoctorId,
            date: start,
            time_start: start,
            duration: maybeDuration ?? undefined,
        })
    }, [context?.clientId, context?.doctorId, effDoctorId, form])

    const createClientMut = useMutation({
        mutationFn: (b: ClientCreateRequest) => createClient(b),
    })

    const createMut = useMutation({
        mutationFn: (b: VisitCreateRequest) => createVisit(b),
        onSuccess: () => {
            message.success('Приём добавлен')
            qc.invalidateQueries({queryKey: ['visits']})
            notifyTotalsChange()
            setOpen(false)
            setIsReserveCreate(false)
            setIsReserveAssign(false)
            form.resetFields()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const updateMut = useMutation({
        mutationFn: (b: VisitUpdateRequest) => updateVisit(editing!.id, b),
        onSuccess: () => {
            message.success('Сохранено')
            qc.invalidateQueries({queryKey: ['visits']})
            notifyTotalsChange()
            setOpen(false)
            setEditing(null)
            setIsReserveCreate(false)
            setIsReserveAssign(false)
            form.resetFields()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteVisit(id),
        onSuccess: () => {
            message.success('Удалено')
            qc.invalidateQueries({queryKey: ['visits']})
            notifyTotalsChange()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const updateStatusMut = useMutation({
        mutationFn: ({id, status}: { id: string; status: VisitStatusEnum }) =>
            updateVisit(id, {status}),
        onSuccess: () => {
            message.success('Статус обновлён')
            qc.invalidateQueries({queryKey: ['visits']})
            notifyTotalsChange()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const {mutate: deleteVisitMutate, isPending: isDeletePending} = deleteMut
    const {mutate: updateVisitStatus, isPending: isUpdateStatusPending} = updateStatusMut

    const createScheduleMut = useMutation({
        mutationFn: (b: ScheduleCreateRequest) => createSchedule(b),
        onSuccess: () => {
            message.success('Разлиновка сохранена')
            qc.invalidateQueries({queryKey: ['schedule']})
            setScheduleModalOpen(false)
            setIsScheduleEdit(false)
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const updateScheduleMut = useMutation({
        mutationFn: ({id, body}: { id: string; body: ScheduleUpdateRequest }) =>
            updateSchedule(id, body),
        onSuccess: () => {
            message.success('Разлиновка обновлена')
            qc.invalidateQueries({queryKey: ['schedule']})
            setScheduleModalOpen(false)
            setIsScheduleEdit(false)
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const deleteScheduleMut = useMutation({
        mutationFn: (id: string) => deleteSchedule(id),
        onSuccess: () => {
            message.success('Разлиновка удалена')
            qc.invalidateQueries({queryKey: ['schedule']})
            setIgnoreSchedule(false)
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    // -------- Колонки --------
    const columns = useMemo<ColumnsType<RowData>>(() => {
        const next: ColumnsType<RowData> = []
        const hiddenGapCell = {colSpan: 0}
        const hiddenGapOrSlotCell = {colSpan: 0}
        const gapCellStyle = {
            color: 'black',
            background: 'pink',
            padding: 4,
        }

        if (!isDayMode && show?.date !== false) {
            next.push({
                title: 'Дата',
                width: 110,
                dataIndex: 'start_date',
                onCell: (row) => (isGap(row) || isSlot(row) ? hiddenGapOrSlotCell : {}),
                render: (iso: string, row: RowData) =>
                    isGap(row) || isSlot(row) ? null : dayjs(iso).format('DD.MM.YYYY'),
            })
        }

        next.push({
            title: 'Время',
            key: 'time',
            width: 140,
            render: (row: RowData) => {
                const start = dayjs(row.start_date).format('HH:mm')
                const end = row.end_date ? dayjs(row.end_date).format('HH:mm') : ''
                const label = end ? `${start}–${end}` : start

                if (isGap(row)) {
                    return <div style={gapCellStyle}>{label}</div>
                }
                return label
            },
        })

        if (show?.client !== false && !context?.clientId) {
            next.push({
                title: 'Пациент',
                key: 'client',
                onCell: (row) => (isGap(row) ? hiddenGapCell : {}),
                render: (_: unknown, row: RowData) => {
                    if (isGap(row)) return null
                    if (isSlot(row)) {
                        return (
                            <Button type="dashed" size="small" onClick={() => openSlotForm(row)}>
                                Добавить
                            </Button>
                        )
                    }

                    const v = row as VisitResponse
                    return (
                        <div style={{display: 'flex', flexDirection: 'column', lineHeight: 1.3}}>
                            <EntityLink kind="clients" id={v.client_id} label={v.client_name}/>
                            {v.client_phone_number && (
                                <span style={{color: '#8c8c8c', fontSize: 12}}>
                                    {formatPhoneNumber(v.client_phone_number)}
                                </span>
                            )}
                        </div>
                    )
                },
            })
        }

        if (show?.doctor !== false && !context?.doctorId) {
            next.push({
                title: 'Врач',
                key: 'doctor',
                onCell: (row) => (isGap(row) ? hiddenGapCell : {}),
                render: (_: unknown, row: RowData) =>
                    isGap(row)
                        ? null
                        : isSlot(row)
                            ? '—'
                            : (
                                <EntityLink
                                    kind="doctors"
                                    id={(row as VisitResponse).doctor_id}
                                    label={(row as VisitResponse).doctor_name}
                                />
                            ),
            })
        }

        if (show?.procedure !== false) {
            next.push({
                title: 'Услуга',
                dataIndex: 'procedure',
                ellipsis: true,
                onCell: (row) => (isGap(row) ? hiddenGapCell : {style: {cursor: 'text'}}),
                render: (_: string | null | undefined, row: RowData) => {
                    if (isGap(row)) return null
                    if (isSlot(row)) return '—'
                    const v = row as VisitResponse

                    const isEditing = editingCell?.id === v.id && editingCell.field === 'procedure'
                    if (isEditing) {
                        return (
                            <Input
                                autoFocus
                                value={typeof draftValue === 'string' ? draftValue : ''}
                                onChange={(e) => setDraftValue(e.target.value)}
                                onPressEnter={() => saveEdit(v)}
                                onBlur={() => saveEdit(v)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') cancelEdit()
                                }}
                                disabled={updateInlineMutate.isPending}
                                placeholder="Услуга"
                            />
                        )
                    }

                    return (
                        <span
                            onClick={() => beginEdit(v, 'procedure')}
                            title="Нажмите, чтобы редактировать"
                        >
                            {v.procedure ?? '—'}
                        </span>
                    )
                },
            })
        }

        if (show?.cabinet !== false) {
            next.push({
                title: 'Кабинет',
                dataIndex: 'cabinet',
                onCell: (row) => (isGap(row) ? hiddenGapCell : {}),
                render: (v: string | null | undefined, row: RowData) =>
                    isGap(row)
                        ? null
                        : isSlot(row)
                            ? '—'
                            : (v ?? '—'),
            })
        }

        if (show?.cost !== false) {
            next.push({
                title: 'Стоимость',
                dataIndex: 'cost',
                width: 110,
                align: 'right',
                onCell: (row) => (isGap(row) ? hiddenGapCell : {style: {cursor: 'text'}}),
                render: (_: number | null | undefined, row: RowData) => {
                    if (isGap(row)) return null
                    if (isSlot(row)) return '—'
                    const v = row as VisitResponse

                    const isEditing = editingCell?.id === v.id && editingCell.field === 'cost'
                    if (isEditing) {
                        return (
                            <InputNumber
                                autoFocus
                                style={{width: '100%'}}
                                value={typeof draftValue === 'number' ? draftValue : null}
                                onChange={(val) => setDraftValue(typeof val === 'number' ? val : null)}
                                onPressEnter={() => saveEdit(v)}
                                onBlur={() => saveEdit(v)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') cancelEdit()
                                }}
                                min={0}
                                step={50}
                                stringMode={false}
                                disabled={updateInlineMutate.isPending}
                                placeholder="Стоимость"
                            />
                        )
                    }
                    return (
                        <span
                            onClick={() => beginEdit(v, 'cost')}
                            title="Нажмите, чтобы редактировать"
                        >
                            {typeof v.cost === 'number' ? v.cost : '—'}
                        </span>
                    )
                },
            })
        }

        if (show?.status !== false) {
            next.push({
                title: 'Ст.',
                dataIndex: 'status',
                width: 56,
                align: 'center',
                onCell: (row) => (isGap(row) ? hiddenGapCell : {}),
                render: (s: VisitStatusEnum, row: RowData) => {
                    if (isGap(row)) return null
                    if (isSlot(row)) return '—'

                    const v = row as VisitResponse
                    return (
                        <Dropdown
                            trigger={['click']}
                            menu={{
                                items: STATUS.map(st => ({
                                    key: st,
                                    label: `${STATUS_META[st].emoji} ${STATUS_META[st].label}`,
                                })),
                                onClick: ({key}) =>
                                    updateVisitStatus({id: v.id, status: key as VisitStatusEnum}),
                            }}
                        >
                            <Tooltip title={STATUS_META[s].label}>
                                <Button
                                    type="text"
                                    loading={isUpdateStatusPending}
                                    style={{padding: 0, lineHeight: 1}}
                                >
                                    {STATUS_META[s].emoji}
                                </Button>
                            </Tooltip>
                        </Dropdown>
                    )
                },
            })
        }

        if (show?.actions !== false) {
            next.push({
                title: 'Действия',
                width: 150,
                onCell: (row) => (isGap(row) ? hiddenGapCell : {}),
                render: (_: unknown, row: RowData) => {
                    if (isGap(row)) return null
                    if (isSlot(row)) return null

                    const v = row as VisitResponse
                    return (
                        <Space>
                            <Button
                                size="small"
                                className="p-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600"
                                onClick={() => navigate(`/visits/${v.id}`)}
                                title="Информация о приёме"
                            >
                                <Info size={16} color="#2563eb"/>
                            </Button>

                            <Button
                                className="p-1 rounded-lg hover:bg-gray-100"
                                size="small"
                                title="Редактировать"
                                onClick={() => {
                                    setEditing(v)
                                    setIsReserveCreate(false)
                                    setIsReserveAssign(false)
                                    setOpen(true)
                                    const start = dayjs(v.start_date)
                                    const end = dayjs(v.end_date)
                                    const rawDuration = v.end_date ? end.diff(start, 'minute') : undefined
                                    const duration = (rawDuration && DURATIONS.includes(rawDuration as DurationMin))
                                        ? (rawDuration as DurationMin)
                                        : undefined
                                    form.setFieldsValue({
                                        patient_mode: 'existing',
                                        client_id: context?.clientId ?? v.client_id,
                                        doctor_id: context?.doctorId ?? v.doctor_id,
                                        date: start,
                                        time_start: start,
                                        duration,
                                        procedure: v.procedure ?? undefined,
                                        cabinet: v.cabinet ?? undefined,
                                        cost: typeof v.cost === 'number' ? v.cost : undefined,
                                        status: v.status,
                                    })
                                }}
                            >
                                <Pencil size={16} className="text-blue-600"/>
                            </Button>

                            <Popconfirm
                                title="Удалить приём?"
                                okText="Удалить"
                                cancelText="Отмена"
                                okButtonProps={{
                                    danger: true,
                                    loading: isDeletePending,
                                }}
                                onConfirm={(e) => {
                                    e?.stopPropagation?.()
                                    deleteVisitMutate(v.id)
                                }}
                                onCancel={(e) => e?.stopPropagation?.()}
                            >
                                <Button
                                    size="small"
                                    danger
                                    loading={isDeletePending}
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 rounded-lg hover:bg-gray-100"
                                    title="Удалить"
                                >
                                    <Trash2 size={16} className="text-red-600"/>
                                </Button>
                            </Popconfirm>
                        </Space>
                    )
                },
            })
        }

        const totalCols = next.length
        const timeColumn = next.find((col) => col.key === 'time') as ColumnType<RowData> | undefined
        if (timeColumn) {
            const prevOnCell = timeColumn.onCell
            timeColumn.onCell = (row, rowIndex) => {
                const base = typeof prevOnCell === 'function' ? (prevOnCell(row, rowIndex) ?? {}) : {}
                return isGap(row) ? {...base, colSpan: totalCols || 1} : base
            }
        }

        return next
    }, [
        beginEdit,
        cancelEdit,
        context?.clientId,
        context?.doctorId,
        draftValue,
        editingCell,
        form,
        isDeletePending,
        navigate,
        openSlotForm,
        saveEdit,
        show?.actions,
        show?.cabinet,
        show?.client,
        show?.cost,
        show?.date,
        show?.doctor,
        show?.procedure,
        show?.status,
        updateInlineMutate.isPending,
        isUpdateStatusPending,
        updateVisitStatus,
        deleteVisitMutate,
        isDayMode,
    ])

    const reserveAssignColumn = useMemo(() => ({
        title: '',
        key: 'reserve_assign',
        width: 170,
        render: (_: unknown, row: RowData) => {
            if (isGap(row) || isSlot(row)) return null
            const v = row as VisitResponse
            return (
                <Button type="dashed" size="small" onClick={() => openReserveAssign(v)}>
                    Назначить время
                </Button>
            )
        },
    }), [openReserveAssign])

    const reserveColumns = useMemo(() => {
        const base = columns.filter((col) => col.key !== 'time')
        const clientIndex = base.findIndex((col) => col.key === 'client')
        const insertAt = clientIndex >= 0 ? clientIndex : 0
        base.splice(insertAt, 0, reserveAssignColumn)
        return base
    }, [columns, reserveAssignColumn])


    // -------- Сабмит формы --------
    const onSubmit = async () => {
        const v = await form.validateFields()

        if (isReserveAssign && editing) {
            if (!v.time_start || !v.duration) {
                message.warning('Укажите время начала и длительность')
                return
            }
            const baseDate = dayjs(editing.start_date)
            const startISO = combineDateAndTime(baseDate, v.time_start)
            const endISO = dayjs(startISO).add(v.duration, 'minute').toISOString()
            updateMut.mutate({start_date: startISO, end_date: endISO})
            return
        }

        let startISO: string | undefined
        let endISO: string | null = null
        if (isReserveCreate) {
            const reserveDate = v.date ?? day
            if (!reserveDate) {
                message.warning('Укажите дату для резервного приёма')
                return
            }
            const reserveDateStr = reserveDate.format('YYYY-MM-DD')
            const reserveIso = `${reserveDateStr}T00:00:00`
            startISO = reserveIso
            endISO = reserveIso
        } else {
            startISO = v.date && v.time_start ? combineDateAndTime(v.date, v.time_start) : undefined
            endISO =
                startISO && v.duration
                    ? dayjs(startISO).add(v.duration, 'minute').toISOString()
                    : null
        }

        // больше не сравниваем start/end — end вычисляется из duration

        let selectedClientId = context?.clientId ?? v.client_id
        if (!editing && !isReserveAssign && !context?.clientId && v.patient_mode === 'new') {
            try {
                const createdClient = await createClientMut.mutateAsync({
                    full_name: v.client_full_name!,
                    phone_number: normalizePhoneNumber(v.client_phone_number)!,
                    date_of_birth: v.client_date_of_birth ? v.client_date_of_birth.format('YYYY-MM-DD') : undefined,
                })
                selectedClientId = createdClient.id
                setClientId(createdClient.id)
                form.setFieldsValue({
                    patient_mode: 'existing',
                    client_id: createdClient.id,
                })
                qc.invalidateQueries({queryKey: ['clients']})
                qc.invalidateQueries({queryKey: ['clients', 'options']})
            } catch (err: unknown) {
                message.error(getErrorMessage(err))
                return
            }
        }

        if (editing) {
            const body: VisitUpdateRequest = {
                client_id: selectedClientId,
                doctor_id: context?.doctorId ?? v.doctor_id,
                start_date: startISO,
                end_date: endISO ?? undefined,
                status: v.status,
                procedure: v.procedure,
                cabinet: v.cabinet,
                cost: v.cost,
            }
            updateMut.mutate(body)
        } else {
            const body: VisitCreateRequest = {
                client_id: selectedClientId!,
                doctor_id: (context?.doctorId ?? v.doctor_id)!,
                start_date: startISO!,            // required
                end_date: endISO,                 // string | null
                procedure: v.procedure ?? null,
                cabinet: v.cabinet ?? null,
                cost: v.cost ?? null,
            }
            createMut.mutate(body)
        }
    }

    const openScheduleModal = useCallback(() => {
        const {h: minH, m: minM} = parseHHMM(MIN_TIME)
        const {h: maxH, m: maxM} = parseHHMM(MAX_TIME)
        const baseDay = (day ?? dayjs()).startOf('day')

        scheduleForm.resetFields()
        scheduleForm.setFieldsValue({
            start_time: baseDay.clone().hour(minH).minute(minM),
            end_time: baseDay.clone().hour(maxH).minute(maxM),
            duration: 10,
        })
        setIsScheduleEdit(false)
        setScheduleModalOpen(true)
    }, [MIN_TIME, MAX_TIME, day, parseHHMM, scheduleForm])

    const openScheduleEditModal = useCallback(() => {
        if (!scheduleData || !day) return
        const baseDay = day.startOf('day')
        const {h: startH, m: startM} = parseHHMMSS(scheduleData.start_time)
        const {h: endH, m: endM} = parseHHMMSS(scheduleData.end_time)
        const durationMinutes = parseDurationMinutes(scheduleData.duration)
        const scheduleDuration = DURATIONS.includes(durationMinutes as DurationMin)
            ? (durationMinutes as DurationMin)
            : undefined

        scheduleForm.resetFields()
        scheduleForm.setFieldsValue({
            start_time: baseDay.clone().hour(startH).minute(startM),
            end_time: baseDay.clone().hour(endH).minute(endM),
            duration: scheduleDuration,
        })
        setIsScheduleEdit(true)
        setScheduleModalOpen(true)
    }, [day, parseDurationMinutes, parseHHMMSS, scheduleData, scheduleForm])

    const submitSchedule = useCallback(async () => {
        if (!effDoctorId || !day) {
            message.warning('Выберите врача и дату для разлиновки')
            return
        }

        const v = await scheduleForm.validateFields()
        if (!v.start_time || !v.end_time || !v.duration) return

        const baseBody = {
            start_time: v.start_time.format('HH:mm:ss'),
            end_time: v.end_time.format('HH:mm:ss'),
            duration: toDurationString(v.duration),
        }

        if (isScheduleEdit && scheduleData) {
            const body: ScheduleUpdateRequest = {
                ...baseBody,
            }
            updateScheduleMut.mutate({id: scheduleData.id, body})
            return
        }

        const body: ScheduleCreateRequest = {
            doctor_id: effDoctorId,
            date: day.format('YYYY-MM-DD'),
            ...baseBody,
        }

        createScheduleMut.mutate(body)
    }, [createScheduleMut, day, effDoctorId, isScheduleEdit, scheduleData, scheduleForm, toDurationString, updateScheduleMut])

    function resetFilters() {
        setClientId(context?.clientId)
        setDoctorId(context?.doctorId)
        setStatus(undefined)
        setCabinet(undefined)
        setProcedure(undefined)

        setDay(null)
        setRange(null)

        setLimit(defaultLimit)
    }

    // -------- UI --------
    return (
        <div>
            {/* Фильтры */}
            <Space
                direction="vertical"
                size="small"
                style={{width: '100%', marginBottom: 16}}
            >
                <Space wrap>
                    <Button
                        type="primary"
                        onClick={() => {
                            setEditing(null)
                            setIsReserveCreate(false)
                            setIsReserveAssign(false)
                            setOpen(true)
                            form.resetFields()
                            form.setFieldsValue({
                                patient_mode: 'existing',
                                client_id: context?.clientId,
                                doctor_id: context?.doctorId,
                                date: day ?? undefined,
                                duration: 10,
                            })
                        }}
                    >
                        Новый приём
                    </Button>
                    <Button onClick={resetFilters} danger ghost>
                        Сбросить
                    </Button>

                    {!context?.clientId && (
                        <EntitySelect entity="clients" value={clientId} onChange={setClientId}
                                      placeholder="Пациент" allowClear/>
                    )}
                    {!context?.doctorId && (
                        <EntitySelect entity="doctors" value={doctorId} onChange={setDoctorId}
                                      placeholder="Врач" allowClear/>
                    )}
                    <Select
                        allowClear
                        placeholder="Статус"
                        value={status}
                        onChange={setStatus}
                        style={{width: 170}}
                        options={STATUS.map(s => ({value: s, label: `${STATUS_META[s].emoji} ${STATUS_META[s].label}`}))}
                    />
                    {show?.cabinet !== false && (
                        <Input placeholder="Кабинет" value={cabinet}
                               onChange={(e) => setCabinet(e.target.value || undefined)}/>
                    )}
                    {/*{show?.procedure !== false && (
                        <Input placeholder="Услуга" value={procedure}
                               onChange={(e) => setProcedure(e.target.value || undefined)}/>
                    )}*/}
                    <DatePicker
                        placeholder="День"
                        format="DD.MM.YYYY"
                        value={day ?? undefined}
                        onChange={(d) => {
                            setDay(d ?? null)
                            if (d) setRange(null)
                        }}
                    />
                    <RangePicker
                        format="DD.MM.YYYY"
                        value={range ?? undefined}
                        onChange={(v) => {
                            if (v && v[0] && v[1]) {
                                const start = v[0].startOf('day')
                                const end = v[1].endOf('day')   // включительно до конца дня
                                setRange([start, end])
                                setDay(null)
                            } else {
                                setRange(null)
                            }
                        }}
                    />
                    {isDoctorDayMode && !isScheduleLoading && (
                        scheduleData ? (
                            <Space size="small">
                                <Button
                                    type="default"
                                    onClick={openScheduleEditModal}
                                    disabled={!day || !effDoctorId}
                                >
                                    Редактировать
                                </Button>
                                <Popconfirm
                                    title="Удалить разлиновку?"
                                    okText="Удалить"
                                    cancelText="Отмена"
                                    okButtonProps={{
                                        danger: true,
                                        loading: deleteScheduleMut.isPending,
                                    }}
                                    onConfirm={(e) => {
                                        e?.stopPropagation?.()
                                        deleteScheduleMut.mutate(scheduleData.id)
                                    }}
                                    onCancel={(e) => e?.stopPropagation?.()}
                                >
                                    <Button
                                        danger
                                        loading={deleteScheduleMut.isPending}
                                    >
                                        Удалить
                                    </Button>
                                </Popconfirm>
                            </Space>
                        ) : (
                            <Button
                                type="dashed"
                                onClick={openScheduleModal}
                                disabled={!day || !effDoctorId}
                            >
                                Разлиновать
                            </Button>
                        )
                    )}
                    {!isDoctorDayMode && (
                        <InputNumber
                            min={1}
                            max={500}
                            value={pageSize}
                            onChange={(v) => {
                                const ps = typeof v === 'number' ? v : defaultLimit
                                setPageSize(ps)
                                setLimit(ps)
                                setPage(1)
                            }}
                            placeholder="Лимит"
                        />
                    )}
                    <Button
                        onClick={() => setPrintOpen(true)}
                        className="p-1 rounded-lg hover:bg-gray-100"
                        title="Печать / PDF"
                    >
                        <Printer size={16} className="text-blue-600"/>
                    </Button>
                </Space>

                <Space size="small" align="center">
                    <Typography.Text type="secondary">
                        Суммарная стоимость найденных приёмов:
                    </Typography.Text>
                    <Typography.Text strong>{totalCostDisplay}</Typography.Text>
                </Space>
                {isDoctorDayMode && scheduleData && (
                    <Space size="small" align="center">
                        <Typography.Text type="secondary">
                            Разлиновка: {scheduleData.start_time.slice(0, 5)}–{scheduleData.end_time.slice(0, 5)} · шаг {parseDurationMinutes(scheduleData.duration)} мин
                        </Typography.Text>
                        <Switch
                            checked={ignoreSchedule}
                            onChange={(checked: boolean) => setIgnoreSchedule(checked)}
                            size="small"
                        />
                        <Typography.Text type="secondary">Отображать без разлиновки</Typography.Text>
                    </Space>
                )}
                {isDoctorDayMode && scheduleData === null && !isScheduleLoading && (
                    <Typography.Text type="secondary">
                        Разлиновки для выбранного дня нет, отображаем стандартные интервалы.
                    </Typography.Text>
                )}
            </Space>

            <Table<RowData>
                rowKey={(r) => (isGap(r) ? r.id : isSlot(r) ? r.id : (r as VisitResponse).id)}
                loading={isLoading || isScheduleLoading}
                dataSource={tableData}
                columns={columns}
                pagination={
                    isDoctorDayMode
                        ? false
                        : {
                            current: page,
                            pageSize: pageSize,
                            total: data?.total ?? 0,
                            showSizeChanger: true,
                            pageSizeOptions: [1, 10, 20, 30, 50, 100],
                            locale: {
                                items_per_page: 'на странице',
                                jump_to: 'Перейти к',
                                page: 'стр.',
                                jump_to_confirm: 'ОК',
                                prev_page: 'Предыдущая страница',
                                next_page: 'Следующая страница',
                            },
                            onChange: (p, ps) => {
                                setPage(p)
                                setPageSize(ps)
                            },
                        }
                }
            />

            {isDoctorDayMode && (
                <div style={{marginTop: 16}}>
                    <Space align="center" style={{marginBottom: 8}}>
                        <Typography.Title level={5} style={{marginBottom: 0}}>
                            Резервный список
                        </Typography.Title>
                        <Button
                            size="middle"
                            type="primary"
                            onClick={() => {
                                if (!day || !effDoctorId) {
                                    message.warning('Выберите врача и дату для резервного приёма')
                                    return
                                }
                                setEditing(null)
                                setIsReserveCreate(true)
                                setIsReserveAssign(false)
                                setOpen(true)
                                form.resetFields()
                                form.setFieldsValue({
                                    patient_mode: 'existing',
                                    client_id: context?.clientId,
                                    doctor_id: context?.doctorId ?? effDoctorId,
                                    date: day,
                                })
                            }}
                        >
                            Добавить в резерв
                        </Button>
                    </Space>
                    <Table<RowData>
                        rowKey={(r) => r.id}
                        loading={isReserveLoading}
                        dataSource={(reserveData?.items ?? []) as RowData[]}
                        columns={reserveColumns}
                        pagination={false}
                        locale={{
                            emptyText: 'Резервных приёмов нет',
                        }}
                    />
                </div>
            )}

            <Modal
                title={isScheduleEdit ? 'Редактировать разлиновку' : 'Разлиновка'}
                open={scheduleModalOpen}
                onCancel={() => {
                    setScheduleModalOpen(false)
                    setIsScheduleEdit(false)
                }}
                onOk={submitSchedule}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={createScheduleMut.isPending || updateScheduleMut.isPending}
            >
                <Form form={scheduleForm} layout="vertical">
                    <Form.Item
                        name="start_time"
                        label="Начало рабочего дня"
                        rules={[{required: true, message: 'Укажите время начала'}]}
                    >
                        <TimePicker
                            format="HH:mm"
                            minuteStep={5}
                            disabledHours={disabledHoursForWorkday}
                            hideDisabledOptions
                            inputReadOnly
                            needConfirm={false}
                            showNow={false}
                        />
                    </Form.Item>

                    <Form.Item
                        name="end_time"
                        label="Конец рабочего дня"
                        rules={[{required: true, message: 'Укажите время окончания'}]}
                    >
                        <TimePicker
                            format="HH:mm"
                            minuteStep={5}
                            disabledHours={disabledHoursForWorkday}
                            hideDisabledOptions
                            inputReadOnly
                            needConfirm={false}
                            showNow={false}
                        />
                    </Form.Item>

                    <Form.Item
                        name="duration"
                        label="Длительность приёма (минуты)"
                        rules={[{required: true, message: 'Укажите длительность'}]}
                    >
                        <Select
                            placeholder="Минуты"
                            options={DURATIONS.map((m) => ({value: m, label: `${m} мин`}))}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={editing ? 'Редактировать приём' : 'Новый приём'}
                open={open}
                onCancel={() => {
                    setOpen(false);
                    setEditing(null)
                    setIsReserveCreate(false)
                    setIsReserveAssign(false)
                }}
                onOk={onSubmit}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={createClientMut.isPending || createMut.isPending || updateMut.isPending}
            >
                <Form form={form} layout="vertical">
                    {!editing && !isReserveAssign && !context?.clientId && (
                        <Form.Item name="patient_mode">
                            <Radio.Group
                                optionType="button"
                                buttonStyle="solid"
                                onChange={(e) => {
                                    const nextMode = e.target.value as PatientMode
                                    if (nextMode === 'new') {
                                        form.setFieldsValue({
                                            patient_mode: 'new',
                                            client_id: undefined,
                                        })
                                        return
                                    }
                                    form.setFieldsValue({
                                        patient_mode: 'existing',
                                        client_full_name: undefined,
                                        client_phone_number: undefined,
                                        client_date_of_birth: null,
                                    })
                                }}
                            >
                                <Radio.Button value="existing">Существующий пациент</Radio.Button>
                                <Radio.Button value="new">Новый пациент</Radio.Button>
                            </Radio.Group>
                        </Form.Item>
                    )}
                    {!isReserveAssign && !context?.clientId && (editing || patientMode === 'existing') && (
                        <Form.Item name="client_id" label="Пациент"
                                   rules={[{required: !editing, message: 'Выберите пациента'}]}>
                            <EntitySelect entity="clients" fullWidth/>
                        </Form.Item>
                    )}
                    {!editing && !isReserveAssign && !context?.clientId && patientMode === 'new' && (
                        <>
                            <Form.Item
                                name="client_full_name"
                                label="ФИО нового пациента"
                                rules={[{required: true, message: 'Укажите ФИО пациента'}]}
                            >
                                <Input/>
                            </Form.Item>
                            <Form.Item
                                name="client_phone_number"
                                label="Телефон"
                                rules={[{required: true, message: 'Укажите телефон пациента'}]}
                                getValueFromEvent={(e) => formatPhoneInput(e.target.value)}
                            >
                                <Input inputMode="tel" placeholder="+7 (___) ___-__-__"/>
                            </Form.Item>
                            <Form.Item name="client_date_of_birth" label="Дата рождения">
                                <DatePicker style={{width: '100%'}} format="DD.MM.YYYY"/>
                            </Form.Item>
                        </>
                    )}
                    {!isReserveAssign && !context?.doctorId && (
                        <Form.Item name="doctor_id" label="Врач"
                                   rules={[{required: !editing, message: 'Выберите врача'}]}>
                            <EntitySelect entity="doctors" fullWidth/>
                        </Form.Item>
                    )}

                    {!isReserveAssign && (
                        <Form.Item name="date" label="Дата" rules={[{required: !editing, message: 'Укажите дату'}]}>
                            <DatePicker
                                format="DD.MM.YYYY"
                                style={{width: '100%'}}
                                disabled={isReserveCreate}
                            />
                        </Form.Item>
                    )}

                    {!isReserveCreate && (
                        <Space size="large" wrap>
                            <Form.Item
                                name="time_start"
                                label="Начало"
                                rules={[{required: !editing || isReserveAssign, message: 'Укажите время начала'}]}
                            >
                                <TimePicker
                                    format="HH:mm"
                                    minuteStep={5}                 // только минуты кратные 5
                                    disabledHours={disabledHoursForWorkday} // часы только 6..22
                                    hideDisabledOptions
                                    inputReadOnly
                                    needConfirm={false}
                                    showNow={false}
                                />
                            </Form.Item>

                        <Form.Item
                                name="duration"
                                label="Длительность"
                                rules={[{required: !editing || isReserveAssign, message: 'Укажите длительность'}]}
                            >
                                <Select
                                    placeholder="Минуты"
                                    style={{width: 140}}
                                    options={DURATIONS.map((m) => ({value: m, label: `${m} мин`}))}
                                />
                            </Form.Item>
                        </Space>
                    )}

                    {!isReserveAssign && (
                        <Form.Item name="procedure" label="Услуга">
                            <Input/>
                        </Form.Item>
                    )}
                    {/*<Form.Item name="cabinet" label="Кабинет">
                        <Input/>
                    </Form.Item>*/}
                    {!isReserveAssign && (
                        <Form.Item name="cost" label="Стоимость">
                            <InputNumber style={{width: '100%'}} min={0} step={50}/>
                        </Form.Item>
                    )}

                    {editing && !isReserveAssign && (
                        <Form.Item name="status" label="Статус">
                            <Select
                                allowClear
                                options={STATUS.map(s => ({
                                    value: s,
                                    label: `${STATUS_META[s].emoji} ${STATUS_META[s].label}`
                                }))}
                            />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
            <AntModal
                title="Печать / PDF"
                open={printOpen}
                onCancel={() => setPrintOpen(false)}
                okText="Печать"
                cancelText="Отмена"
                onOk={() => {
                    setPrintOpen(false);
                    setTimeout(() => doPrint(), 0)
                }}
            >
                <p>Выберите колонки для печати:</p>
                {(Object.keys(PRINT_HEADERS) as PrintColumnKey[]).map((col) => (
                    <div key={col} style={{marginBottom: 8}}>
                        <Checkbox
                            checked={printCols.includes(col)}
                            onChange={(e: CheckboxChangeEvent) => {
                                setPrintCols(prev => e.target.checked ? [...prev, col] : prev.filter(c => c !== col))
                            }}
                        >
                            {PRINT_HEADERS[col]}
                        </Checkbox>
                    </div>
                ))}
            </AntModal>

            {/* Скрытая область для печати */}
            <div style={{position: 'fixed', left: -9999, top: -9999}}>
                <VisitsPrintSheet
                    ref={printRef}
                    title={printTitle}
                    subtitle={printSubtitle}
                    note={printNote}
                    columns={printCols}
                    data={printData}
                    clientsMap={clientsMap}
                    doctorsMap={doctorsMap}
                />
            </div>
        </div>
    )
}
