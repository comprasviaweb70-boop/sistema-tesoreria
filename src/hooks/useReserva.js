
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

export function useReserva(fechaInicio, fechaFin) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('reserva_movimientos')
        .select('*, cajas(nombre, numero_caja)')
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true });

      if (fechaInicio) query = query.gte('fecha', fechaInicio);
      if (fechaFin) query = query.lte('fecha', fechaFin);

      console.log("Fetching movements with:", { fechaInicio, fechaFin });
      const { data, error } = await query;

      if (error) {
        console.error("Supabase error fetching reserva:", error);
        throw error;
      }
      console.log("Successfully fetched", data?.length, "movements");
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error fetching reserva:', err);
      // If table doesn't exist yet, we don't want to crash but notify
      if (err.code === 'PGRST116' || err.message?.includes('relation "reserva_movimientos" does not exist')) {
         toast({
          title: "Tabla no encontrada",
          description: "La tabla 'reserva_movimientos' aún no ha sido creada en Supabase.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin, toast]);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  const addMovimiento = async (movimiento) => {
    try {
      const { data, error } = await supabase
        .from('reserva_movimientos')
        .insert([movimiento])
        .select()
        .single();

      if (error) throw error;
      
      // Update local state or re-fetch
      await fetchMovimientos();
      return data;
    } catch (err) {
      console.error('Error adding reserva movement:', err);
      throw err; // Rethrow to be caught by component
    }
  };

  const deleteMovimiento = async (id) => {
    try {
      const { error } = await supabase
        .from('reserva_movimientos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setMovimientos(prev => prev.filter(m => m.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting movement:', err);
      return false;
    }
  };

  const updateMovimiento = async (id, movimiento) => {
    try {
      const { data, error } = await supabase
        .from('reserva_movimientos')
        .update(movimiento)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      await fetchMovimientos();
      return data;
    } catch (err) {
      console.error('Error updating reserva movement:', err);
      throw err;
    }
  };

  return { movimientos, loading, addMovimiento, updateMovimiento, deleteMovimiento, refresh: fetchMovimientos };
}
