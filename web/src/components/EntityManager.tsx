// src/components/EntityManager.tsx
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Space, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormInstance } from 'antd'

// антовский setFieldsValue ждёт recursive partial
export type RecursivePartial<T> = {
    [K in keyof T]?: T[K] extends object ? RecursivePartial<T[K]> : T[K]
}
import { getErrorMessage } from '../lib/errors'
import {Pencil} from "lucide-react";

type WithId = { id: string }

type EntityManagerProps<
    TItem extends WithId,
    TCreate,
    TUpdate,
    TFormValues
> = {
    title: string
    queryKey: readonly unknown[]
    fetchList: (search: string) => Promise<TItem[]>
    createItem: (body: TCreate) => Promise<TItem>
    updateItem: (id: string, body: TUpdate) => Promise<TItem>
    columns: ColumnsType<TItem>
    renderForm: (form: FormInstance<TFormValues>, editing: TItem | null) => ReactNode
    toForm: (item: TItem) => RecursivePartial<TFormValues>
    toCreate: (v: TFormValues) => TCreate
    toUpdate: (v: TFormValues) => TUpdate
    searchPlaceholder?: string
    createButtonText?: string
    initialValues?: RecursivePartial<TFormValues>
};

export default function EntityManager<
    TItem extends WithId,
    TCreate,
    TUpdate,
    TFormValues
>(props: EntityManagerProps<TItem, TCreate, TUpdate, TFormValues>) {
    const {
        title, queryKey, fetchList, createItem, updateItem,
        columns, renderForm, toForm, toCreate, toUpdate, initialValues,
        searchPlaceholder = 'Поиск…', createButtonText = 'Создать',
    } = props

    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const [debounced, setDebounced] = useState('')
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState<TItem | null>(null)
    const [form] = Form.useForm<TFormValues>()

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search), 300)
        return () => clearTimeout(t)
    }, [search])

    const { data, isLoading } = useQuery({
        queryKey: [...queryKey, debounced],
        queryFn: () => fetchList(debounced),
    })

    const createMut = useMutation({
        mutationFn: (b: TCreate) => createItem(b),
        onSuccess: () => {
            message.success('Создано')
            qc.invalidateQueries({ queryKey })
            setOpen(false); form.resetFields()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const updateMut = useMutation({
        mutationFn: (b: TUpdate) => updateItem(editing!.id, b),
        onSuccess: () => {
            message.success('Сохранено')
            qc.invalidateQueries({ queryKey })
            setOpen(false); setEditing(null); form.resetFields()
        },
        onError: (err: unknown) => message.error(getErrorMessage(err)),
    })

    const tableColumns: ColumnsType<TItem> = useMemo(() => ([
        ...columns,
        {
            title: 'Действия',
            key: 'actions',
            width: 140,
            render: (_: unknown, row: TItem) => (
                <Button onClick={() => {
                    setEditing(row); setOpen(true)
                    // setFieldsValue ожидает RecursivePartial<TFormValues>
                    form.setFieldsValue(toForm(row) as Parameters<typeof form.setFieldsValue>[0])
                }}>
                    <Pencil size={16} className="text-blue-600" />
                </Button>
            ),
        },
    ]), [columns, form, toForm])

    const onSubmit = async () => {
        const v = await form.validateFields() as TFormValues
        if (editing) {
            updateMut.mutate(toUpdate(v))
        } else {
            createMut.mutate(toCreate(v))
        }
    }

    return (
        <div>
            <Space style={{ marginBottom: 12 }}>
                <Input
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                />
                <Button
                    type="primary"
                    onClick={() => {
                        setEditing(null)
                        setOpen(true)
                        form.resetFields()
                        if (initialValues) form.setFieldsValue(initialValues as Parameters<typeof form.setFieldsValue>[0])
                    }}
                >
                    {createButtonText}
                </Button>
            </Space>

            <Table<TItem> rowKey="id" loading={isLoading} dataSource={data || []} columns={tableColumns} />

            <Modal
                title={editing ? `Редактировать ${title}` : `Новый ${title}`}
                open={open}
                onCancel={() => { setOpen(false); setEditing(null) }}
                onOk={onSubmit}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={createMut.isPending || updateMut.isPending}
            >
                <Form form={form} layout="vertical" initialValues={initialValues}>
                    {renderForm(form, editing)}
                </Form>
            </Modal>
        </div>
    )
}
