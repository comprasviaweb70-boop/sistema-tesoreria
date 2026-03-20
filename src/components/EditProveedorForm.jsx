
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

const EditProveedorForm = ({ isOpen, onClose, onSuccess, proveedor }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    rut: '',
    telefono: '',
    email: '',
    activo: true
  });

  useEffect(() => {
    if (proveedor) {
      setFormData({
        nombre: proveedor.nombre || '',
        rut: proveedor.rut || '',
        telefono: proveedor.telefono || '',
        email: proveedor.email || '',
        activo: proveedor.activo ?? true
      });
    }
  }, [proveedor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (checked) => {
    setFormData((prev) => ({ ...prev, activo: checked }));
  };

  const validateRUT = async (rut, currentId) => {
    if (!rut || !rut.trim()) return true; // RUT is optional
    const { data, error } = await supabase
      .from('proveedores')
      .select('id')
      .eq('rut', rut.trim())
      .neq('id', currentId)
      .maybeSingle();
    
    if (error) throw error;
    return !data; // Returns true if no OTHER provider has this RUT
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const isRutValid = await validateRUT(formData.rut, proveedor.id);
      if (!isRutValid) {
        toast({ title: 'Error', description: 'Este RUT ya existe en el sistema.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const dataToUpdate = {
        ...formData,
        rut: formData.rut?.trim() || null // Save empty strings as null
      };

      const { error } = await supabase
        .from('proveedores')
        .update(dataToUpdate)
        .eq('id', proveedor.id);

      if (error) throw error;

      toast({ title: 'Éxito', description: 'Proveedor actualizado correctamente.' });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating proveedor:', error);
      toast({ title: 'Error', description: error.message || 'No se pudo actualizar el proveedor.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] glass-card border-border">
        <DialogHeader>
          <DialogTitle>Editar Proveedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-nombre">Nombre <span className="text-red-500">*</span></Label>
            <Input id="edit-nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-rut">RUT</Label>
            <Input id="edit-rut" name="rut" value={formData.rut} onChange={handleChange} placeholder="(Opcional)" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-telefono">Teléfono</Label>
            <Input id="edit-telefono" name="telefono" value={formData.telefono} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" name="email" type="email" value={formData.email} onChange={handleChange} />
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Switch id="edit-activo" checked={formData.activo} onCheckedChange={handleSwitchChange} />
            <Label htmlFor="edit-activo">Proveedor Activo</Label>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="accent-button" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditProveedorForm;
