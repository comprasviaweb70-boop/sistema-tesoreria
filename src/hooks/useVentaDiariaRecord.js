
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { recalculateVentaDiaria } from '@/utils/ventaDiariaSync';

export function useVentaDiariaRecord({ fecha, turno, caja_id, cajero_id, autoCreate = false }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRecord = useCallback(async () => {
    if (!fecha || !turno || !caja_id) {
      setRecord(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setRecord(null); // Limpiar registro anterior para evitar "fantasmas" visuales
    try {
      const { data, error } = await supabase
        .from('venta_diaria')
        .select('*')
        .eq('fecha', fecha)
        .eq('turno', turno)
        .eq('caja_id', caja_id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setRecord(data);
      } else {
        setRecord(null);
        if (autoCreate) {
          await createRecordInternal();
        }
      }
    } catch (err) {
      console.error('Error fetching venta diaria:', err);
    } finally {
      setLoading(false);
    }
  }, [fecha, turno, caja_id, autoCreate]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  const createRecordInternal = async () => {
    try {
      const { data, error } = await supabase
        .from('venta_diaria')
        .insert([{
          fecha,
          turno,
          caja_id,
          cajero_id,
          estado: 'Abierto',
          saldo_inicial: 0,
          venta_efectivo: 0,
          redelcom: 0,
          tarjeta_credito: 0,
          edenred: 0,
          transferencia: 0,
          credito: 0,
          total_ventas: 0,
          pago_facturas_caja: 0,
          pago_facturas_cc: 0,
          gastos_rrhh: 0,
          otros_gastos: 0,
          servicios: 0,
          gastos: 0,
          correccion_boletas: 0,
          otros_egresos: 0,
          ingresos_efectivo: 0,
          retiros_efectivo: 0,
          traspaso_tesoreria_ingreso: 0,
          traspaso_tesoreria_egreso: 0,
          cierre_declarado_pdf: 0
        }])
        .select()
        .single();

      if (error) throw error;
      
      // Recalcular para asegurar que traemos movimientos realizados ANTES de la creación
      try {
        await recalculateVentaDiaria(supabase, fecha, turno, caja_id);
        // Volver a cargar el registro ahora que tiene los totales sincronizados
        const { data: refreshed } = await supabase
          .from('venta_diaria')
          .select('*')
          .eq('id', data.id)
          .single();
        
        if (refreshed) {
          setRecord(refreshed);
          return refreshed;
        }
      } catch (syncErr) {
        console.error('Error syncing after creation:', syncErr);
      }

      setRecord(data);
      return data;
    } catch (err) {
      console.error('Error creating venta diaria:', err);
      toast({
        title: "Error al crear",
        description: "No se pudo crear el registro de venta diaria.",
        variant: "destructive"
      });
      return null;
    }
  };

  /**
   * Re-fetch silently without clearing state first (no flicker).
   * Use this when you want to refresh after a sync without the form disappearing.
   */
  const silentRefresh = useCallback(async () => {
    if (!fecha || !turno || !caja_id) return;
    try {
      const { data, error } = await supabase
        .from('venta_diaria')
        .select('*')
        .eq('fecha', fecha)
        .eq('turno', turno)
        .eq('caja_id', caja_id)
        .maybeSingle();
      if (error) throw error;
      if (data) setRecord(data);
    } catch (err) {
      console.error('[useVentaDiariaRecord] silentRefresh error:', err);
    }
  }, [fecha, turno, caja_id]);

  return { 
    record, 
    setRecord,
    loading, 
    createRecord: createRecordInternal,
    refreshRecord: silentRefresh,      // silently updates without clearing (used by Re-sync button)
    fullRefresh: fetchRecord            // full reload with loading state (used on mount/param change)
  };
}
