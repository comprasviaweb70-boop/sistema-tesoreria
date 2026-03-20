
import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContextObject';
import { useToast } from '@/hooks/use-toast';

const AdminRoleManagement = ({ user, onUpdate }) => {
  // Normalizar rol para que coincida con los valores de SelectItem (Title Case)
  const normalizeRole = (r) => {
    if (!r) return 'Cajero';
    const low = r.toLowerCase().trim();
    if (low === 'admin') return 'admin';
    if (low === 'supervisor') return 'supervisor';
    return 'cajero';
  };

  const [selectedRole, setSelectedRole] = useState(normalizeRole(user.rol));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { changeUserRole, userProfile } = useAuth();
  const { toast } = useToast();

  const handleRoleChange = (newValue) => {
    setSelectedRole(newValue);
  };

  const handleUpdateClick = () => {
    if (selectedRole !== user.rol) {
      setIsDialogOpen(true);
    }
  };

  const confirmRoleChange = async () => {
    setIsUpdating(true);
    try {
      const { error } = await changeUserRole(user.id, selectedRole);
      
      if (error) throw error;
      
      toast({
        title: "Rol actualizado",
        description: `El rol de ${user.nombre} ha sido cambiado a ${selectedRole}.`,
      });
      
      if (onUpdate) {
        onUpdate(user.id, selectedRole);
      }
    } catch (error) {
      toast({
        title: "Error al actualizar",
        description: error.message || "No se pudo actualizar el rol.",
        variant: "destructive",
      });
      // Revert selection on error
      setSelectedRole(user.rol);
    } finally {
      setIsUpdating(false);
      setIsDialogOpen(false);
    }
  };

  const isSelf = userProfile?.id === user.id;

  return (
    <div className="flex items-center gap-2">
      <Select 
        value={selectedRole} 
        onValueChange={handleRoleChange}
        disabled={isUpdating || isSelf}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Seleccionar Rol" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Administrador</SelectItem>
          <SelectItem value="supervisor">Supervisor</SelectItem>
          <SelectItem value="cajero">Cajero</SelectItem>
        </SelectContent>
      </Select>
      
      <Button 
        size="sm" 
        variant="outline" 
        onClick={handleUpdateClick}
        disabled={selectedRole === user.rol || isUpdating || isSelf}
        className="h-8 px-2 text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
      >
        {isUpdating ? '...' : 'Actualizar'}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="glass-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <ShieldAlert className="h-5 w-5" />
              Confirmar cambio de rol
            </DialogTitle>
            <DialogDescription className="pt-3">
              ¿Estás seguro de que deseas cambiar el rol de <strong>{user.nombre}</strong> de <span className="font-semibold text-muted-foreground">{user.rol}</span> a <span className="font-semibold accent-text">{selectedRole}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUpdating}>
              Cancelar
            </Button>
            <Button className="accent-button" onClick={confirmRoleChange} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Actualizando...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Confirmar Cambio
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRoleManagement;
