"use client"

import React, { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { CalendarIcon } from 'lucide-react'
import 'react-day-picker/style.css'

export function DatePicker({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const date = value ? new Date(value + 'T12:00:00') : undefined

  return (
    <div ref={ref} className={'relative ' + className}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(!open)}
        className="w-full justify-start text-left font-normal glass-button h-9"
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {date ? format(date, 'dd/MM/yyyy', { locale: es }) : <span>Seleccionar fecha</span>}
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 bg-popover border border-border rounded-lg shadow-xl">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(day) => {
              if (day) {
                const y = day.getFullYear()
                const m = String(day.getMonth() + 1).padStart(2, '0')
                const d = String(day.getDate()).padStart(2, '0')
                onChange(y + '-' + m + '-' + d)
                setOpen(false)
              }
            }}
            locale={es}
            weekStartsOn={1}
            className="!m-0"
          />
        </div>
      )}
    </div>
  )
}
