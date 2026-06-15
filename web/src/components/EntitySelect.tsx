import {Select} from 'antd'
import {useQuery} from '@tanstack/react-query'
import {api} from '../lib/api'
import type {ClientResponse, DoctorResponse} from '../api'
import {useEffect, useMemo, useState} from 'react'

type Props = {
    entity: 'clients' | 'doctors'
    value?: string
    onChange?: (v?: string) => void
    allowClear?: boolean
    placeholder?: string
    fullWidth?: boolean
}

type Option = { value: string; label: string }

function prepareSearch(entity: 'clients' | 'doctors', search: string): string {
    if (entity !== 'clients') return search

    const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(search)
    const digits = search.replace(/\D/g, '')

    if (hasLetters || !digits) return search
    if (digits.length >= 10 && digits.startsWith('8')) return `7${digits.slice(1)}`

    return digits
}

async function fetchOptions(entity: 'clients' | 'doctors', search: string): Promise<Option[]> {
    const searchSubstr = prepareSearch(entity, search)

    if (entity === 'clients') {
        const res = await api.get<ClientResponse[]>('/clients/', {params: {search_substr: searchSubstr}})
        return res.data.map(c => ({value: c.id, label: c.full_name}))
    }
    const res = await api.get<DoctorResponse[]>('/doctors/', {params: {search_substr: searchSubstr}})
    return res.data.map(d => ({value: d.id, label: d.full_name}))
}

async function fetchSelectedOption(entity: 'clients' | 'doctors', id: string): Promise<Option> {
    if (entity === 'clients') {
        const res = await api.get<ClientResponse>(`/clients/${id}`)
        return {value: res.data.id, label: res.data.full_name}
    }
    const res = await api.get<DoctorResponse>(`/doctors/${id}`)
    return {value: res.data.id, label: res.data.full_name}
}

export default function EntitySelect({entity, value, onChange, allowClear, placeholder, fullWidth = false}: Props) {
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedSearch(search), 250)
        return () => window.clearTimeout(timeoutId)
    }, [search])

    const {data, isLoading} = useQuery({
        queryKey: [entity, 'options', debouncedSearch],
        queryFn: () => fetchOptions(entity, debouncedSearch),
    })

    const {data: selectedOption, isLoading: isSelectedOptionLoading} = useQuery({
        queryKey: [entity, 'option', value],
        queryFn: () => fetchSelectedOption(entity, value!),
        enabled: !!value,
    })

    const options = useMemo(() => {
        const loadedOptions = data ?? []
        if (!selectedOption) return loadedOptions
        if (loadedOptions.some(option => option.value === selectedOption.value)) {
            return loadedOptions
        }
        return [selectedOption, ...loadedOptions]
    }, [data, selectedOption])

    return (
        <Select
            showSearch
            filterOption={false}
            loading={isLoading || isSelectedOptionLoading}
            value={value}
            onChange={onChange}
            onSearch={setSearch}
            allowClear={allowClear}
            placeholder={placeholder}
            optionFilterProp="label"
            style={{
                width: fullWidth ? '100%' : undefined,
                minWidth: 170,
                maxWidth: fullWidth ? '100%' : 250,
            }}
            options={options}
        />
    )
}
