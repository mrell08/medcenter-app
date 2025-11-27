import {api} from '../lib/api'

export type ScheduleCreateRequest = {
    doctor_id: string
    date: string
    start_time: string
    end_time: string
    duration: string
}

export type ScheduleResponse = {
    id: string
    dt_created: string
    dt_updated: string
    doctor_id: string
    date: string
    start_time: string
    end_time: string
    duration: string
}

export type ScheduleUpdateRequest = Partial<{
    doctor_id: string
    date: string
    start_time: string
    end_time: string
    duration: string
}>

export async function fetchSchedule(date: string, doctorId: string): Promise<ScheduleResponse> {
    const res = await api.get<ScheduleResponse>(`/schedules/${date}/${doctorId}`)
    return res.data
}

export async function createSchedule(body: ScheduleCreateRequest): Promise<ScheduleResponse> {
    const res = await api.post<ScheduleResponse>('/schedules', body)
    return res.data
}

export async function updateSchedule(id: string, body: ScheduleUpdateRequest): Promise<ScheduleResponse> {
    const res = await api.patch<ScheduleResponse>(`/schedules/${id}`, body)
    return res.data
}

export async function deleteSchedule(id: string): Promise<void> {
    await api.delete(`/schedules/${id}`)
}

