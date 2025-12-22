import { api } from '../lib/api'
import type { VisitResponse, VisitStatusEnum } from '.'

export type VisitQueryParams = {
    limit?: number
    offset?: number
    client_id?: string
    doctor_id?: string
    start_date?: string
    end_date?: string
    cabinet?: string
    procedure?: string
    status?: VisitStatusEnum
    reserve_list?: boolean
}

export type VisitPageResponse = {
    total: number
    limit: number
    offset: number
    items: VisitResponse[]
    total_cost?: number
}

export async function fetchVisits(params: VisitQueryParams): Promise<VisitPageResponse> {
    const res = await api.get<VisitPageResponse>('/visits/', { params })
    return res.data
}
