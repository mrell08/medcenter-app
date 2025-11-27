const cleanDigits = (value: string): string => value.replace(/\D/g, '')

const ensureSevenPrefix = (digits: string): string => {
    if (!digits) return '7'
    if (digits.startsWith('8')) return `7${digits.slice(1)}`
    if (digits.startsWith('7')) return digits
    return `7${digits}`
}

export function formatPhoneNumber(value?: string | null): string {
    const rawDigits = cleanDigits(value ?? '')
    if (!rawDigits) return ''

    const normalized = ensureSevenPrefix(rawDigits).slice(0, 11)

    let result = '+7'

    if (normalized.length > 1) {
        result += ' (' + normalized.slice(1, 4)
        if (normalized.length >= 4) result += ')'
    }

    if (normalized.length > 4) result += ' ' + normalized.slice(4, 7)
    if (normalized.length > 7) result += '-' + normalized.slice(7, 9)
    if (normalized.length > 9) result += '-' + normalized.slice(9, 11)

    return result
}

export function formatPhoneInput(value?: string | null): string {
    const digits = cleanDigits(value ?? '')
    if (!digits) return ''

    const normalized = ensureSevenPrefix(digits).slice(0, 11)

    let result = '+7'
    const rest = normalized.slice(1)

    if (rest.length > 0) {
        result += ' (' + rest.slice(0, 3)
        if (rest.length >= 3) result += ')'
    }

    if (rest.length > 3) result += ' ' + rest.slice(3, 6)
    if (rest.length > 6) result += '-' + rest.slice(6, 8)
    if (rest.length > 8) result += '-' + rest.slice(8, 10)

    return result
}

export function normalizePhoneNumber(value?: string | null): string | undefined {
    const digits = cleanDigits(value ?? '')
    if (!digits) return undefined

    const normalized = ensureSevenPrefix(digits)
    return `+${normalized.slice(0, 11)}`
}
