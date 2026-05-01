import { DatePicker, Form, Input } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import EntityManager from '../components/EntityManager'
import EntityLink from '../components/EntityLink'
import { api } from '../lib/api'
import type { ClientCreateRequest, ClientResponse, ClientUpdateRequest } from '../api'
import { formatPhoneInput, formatPhoneNumber, normalizePhoneNumber } from '../lib/phone'

/** UI-форма пациентов: дата — Dayjs|null */
type ClientForm = {
    full_name?: string
    phone_number?: string
    date_of_birth?: Dayjs | null
}

async function fetchClients(search: string): Promise<ClientResponse[]> {
    const res = await api.get<ClientResponse[]>('/clients/', { params: { search_substr: search } })
    return res.data
}
async function createClient(body: ClientCreateRequest): Promise<ClientResponse> {
    const res = await api.post<ClientResponse>('/clients/', body)
    return res.data
}
async function updateClient(id: string, body: ClientUpdateRequest): Promise<ClientResponse> {
    const res = await api.patch<ClientResponse>(`/clients/${id}`, body)
    return res.data
}
async function deleteClient(id: string): Promise<void> {
    await api.delete(`/clients/${id}`)
}

const columns: ColumnsType<ClientResponse> = [
    {
        title: 'ФИО',
        dataIndex: 'full_name',
        render: (_: unknown, row: ClientResponse) => (
            <EntityLink kind="clients" id={row.id} label={row.full_name} />
        ),
    },
    {
        title: 'Телефон',
        dataIndex: 'phone_number',
        render: (value: string | null) => formatPhoneNumber(value),
    },
    {
        title: 'Дата рождения',
        dataIndex: 'date_of_birth',
        render: (value: string | null) =>
            value ? dayjs(value).format('DD.MM.YYYY') : '',
    },
]

export default function ClientsPage() {
    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2>Пациенты</h2>

            <EntityManager<ClientResponse, ClientCreateRequest, ClientUpdateRequest, ClientForm>
                title="пациент"
                queryKey={['clients']}
                fetchList={fetchClients}
                createItem={createClient}
                updateItem={updateClient}
                deleteItem={deleteClient}
                columns={columns}
                deleteSuccessMessage="Пациент удалён"
                invalidateOnDelete={[['clients', 'options'], ['visits']]}
                getDeleteTitle={(item) => `Удалить пациента «${item.full_name}»?`}
                getDeleteDescription={(item) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>Телефон: {formatPhoneNumber(item.phone_number) || '—'}</span>
                        <span>
                            Дата рождения: {item.date_of_birth ? dayjs(item.date_of_birth).format('DD.MM.YYYY') : '—'}
                        </span>
                        <span>Все приёмы этого пациента тоже будут удалены.</span>
                    </div>
                )}
                searchPlaceholder="Поиск по ФИО/телефону"
                createButtonText="Новый пациент"
                initialValues={{ phone_number: formatPhoneInput('') }}
                renderForm={() => (
                    <>
                        <Form.Item name="full_name" label="ФИО" rules={[{ required: true, message: 'Укажите ФИО' }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item
                            name="phone_number"
                            label="Телефон"
                            rules={[{ required: true, message: 'Укажите телефон' }]}
                            getValueFromEvent={(e) => formatPhoneInput(e.target.value)}
                        >
                            <Input inputMode="tel" placeholder="+7 (___) ___-__-__" />
                        </Form.Item>
                        <Form.Item name="date_of_birth" label="Дата рождения">
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                    </>
                )}
                toForm={(item) => ({
                    full_name: item.full_name,
                    phone_number: formatPhoneInput(item.phone_number),
                    date_of_birth: item.date_of_birth ? dayjs(item.date_of_birth) : null,
                })}
                toCreate={(v) => ({
                    full_name: v.full_name!,
                    phone_number: normalizePhoneNumber(v.phone_number)!,
                    date_of_birth: v.date_of_birth ? v.date_of_birth.format('YYYY-MM-DD') : undefined,
                })}
                toUpdate={(v) => ({
                    full_name: v.full_name,
                    phone_number: normalizePhoneNumber(v.phone_number),
                    date_of_birth: v.date_of_birth ? v.date_of_birth.format('YYYY-MM-DD') : undefined,
                })}
            />
        </div>
    )
}
