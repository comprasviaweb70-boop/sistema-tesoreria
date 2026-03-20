import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { AuthContext, useAuth } from './AuthContextObject';
export { useAuth };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const ADMIN_EMAIL = 'admin@iclmarket.com';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Error getting session:", error);
      }
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile. This could be due to RLS policies or missing record:', error);
        throw error;
      }
      setUserProfile(data);
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (username, password) => {
    try {
      // 1. Buscar el email asociado al nombre de usuario en la tabla usuarios
      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('email')
        .ilike('nombre_completo', username)
        .maybeSingle();

      if (userError || !userData?.email) {
        throw new Error("Usuario no encontrado o contraseña incorrecta.");
      }

      // 2. Iniciar sesión usando el email encontrado
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        await fetchUserProfile(data.user.id);
      }

      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    }
  };

  const signUp = async (email, password, fullName) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;
      
      if (data?.user) {
        // Forzar inserción o actualización en la tabla pública por si el trigger falla
        // al capturar los metadatos.
        await supabase.from('usuarios').upsert({
          id: data.user.id,
          email: email,
          nombre_completo: fullName,
          rol: 'cajero'
        });
      }

      return { data, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const role = userProfile?.rol?.trim().toLowerCase();
  const isAdmin = role === 'admin' || 
                  user?.email === ADMIN_EMAIL || 
                  user?.email === 'jsanz70@gmail.com' || 
                  user?.email === 'jsanz@iclmarket.local' ||
                  userProfile?.nombre?.toLowerCase().includes('jsanz');
  const isSupervisor = role === 'supervisor' || isAdmin;
  const isCajero = role === 'cajero' || !role;

  const changeUserRole = async (userId, newRole) => {
    if (!isAdmin) {
      return { error: new Error('Acceso denegado: Se requieren permisos de administrador') };
    }

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .update({ rol: newRole })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      if (userProfile && userId === userProfile.id) {
        setUserProfile(data);
      }

      return { data, error: null };
    } catch (error) {
      console.error('Error updating user role:', error);
      return { data: null, error };
    }
  };

  const rolNorm = userProfile?.rol?.toLowerCase() || '';

  const value = {
    user,
    userProfile,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user,
    isAdmin,
    isAdministrador: isAdmin,
    isSupervisor,
    isCajero,
    changeUserRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
