
import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

const ProveedorForm = ({ isOpen, onClose, onSuccess }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    rut: '',
    telefono: '',
    email: '',
    activo: true
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateRUT = async (rut) => {
    if (!rut || !rut.trim()) return true; // RUT is optional, empty/null is valid
    const { data, error } = await supabase
      .from('proveedores')
      .select('id')
      .eq('rut', rut.trim())
      .maybeSingle();
    
    if (error) throw error;
    return !data; // Returns true if no existing RUT found
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const isRutValid = await validateRUT(formData.rut);
      if (!isRutValid) {
        toast({ title: 'Error', description: 'Este RUT ya existe en el sistema.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const dataToInsert = {
        ...formData,
        rut: formData.rut?.trim() || null // Save empty strings as null to leverage partial index
      };

      const { error } = await supabase.from('proveedores').insert([dataToInsert]);
      if (error) throw error;

      toast({ title: 'Éxito', description: 'Proveedor creado correctamente.' });
      setFormData({ nombre: '', rut: '', telefono: '', email: '', activo: true });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating proveedor:', error);
      toast({ title: 'Error', description: error.message || 'No se pudo crear el proveedor.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] glass-card border-border">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Proveedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre <span className="text-red-500">*</span></Label>
            <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rut">RUT</Label>
            <Input id="rut" name="rut" value={formData.rut} onChange={handleChange} placeholder="12345678-9 (Opcional)" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" name="telefono" value={formData.telefono} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="accent-button" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear Proveedor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProveedorForm;
