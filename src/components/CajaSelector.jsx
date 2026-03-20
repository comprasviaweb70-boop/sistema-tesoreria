
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const CajaSelector = ({ 
  value, 
  onChange, 
  label = "Caja", 
  required = false, 
  disabled = false, 
  className = "",
  showAllOption = false,
  allOptionLabel = "Todas las cajas"
}) => {
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCajas() {
      try {
        setLoading(true);
        // 1. Intentar cargar desde la tabla cajas
        const { data: cajasData, error: cajasError } = await supabase
          .from('cajas')
          .select('id, nombre, numero_caja')
          .eq('activo', true)
          .order('nombre');
          
        if (cajasError) throw cajasError;

        if (cajasData && cajasData.length > 0) {
          setCajas(cajasData);
        } else {
          // 2. Si no hay cajas, cargar desde usuarios (cajeros) como fallback
          const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('id, nombre, nombre_completo')
            .ilike('rol', 'cajero')
            .order('nombre');

          if (userError) throw userError;

          const transformedUsers = (userData || []).map((u, index) => ({
            id: u.id,
            nombre: u.nombre || u.nombre_completo,
            numero_caja: index + 1 // Asignar un número temporal
          }));
          
          setCajas(transformedUsers);
        }
      } catch (err) {
        console.error('Error fetching cajas/users:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCajas();
  }, []);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label className="flex items-center gap-2">{label}</Label>}
      <Select 
        value={value || ''} 
        onValueChange={onChange} 
        disabled={disabled || loading} 
        required={required}
      >
        <SelectTrigger className="bg-background text-foreground">
          <SelectValue placeholder={loading ? "Cargando..." : "Seleccione caja..."} />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && (
            <SelectItem value="all">{allOptionLabel}</SelectItem>
          )}
          {cajas.map(c => (
            <SelectItem key={c.id} value={c.id}>
              {c.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default CajaSelector;
