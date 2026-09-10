import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export function useLocation() {
  const [isLocating, setIsLocating] = useState(false);

  const updateCityFromCoords = useCallback(async (lat: number, lon: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        {
          headers: {
            'User-Agent': 'Cosmooss/1.0'
          }
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data?.address?.city || 
             data?.address?.town || 
             data?.address?.village || 
             data?.address?.suburb || 
             data?.address?.county || 
             '';
    } catch (error) {
      console.error("Error fetching city:", error);
    }
    return '';
  }, []);

  const getCurrentLocation = useCallback((
    onSuccess: (city: string, url: string) => void,
    onError?: (message: string) => void
  ) => {
    // Geolocation is used to help sellers precisely locate their shop/product
    // which is essential for a local marketplace experience.
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        
        const city = await updateCityFromCoords(latitude, longitude);
        onSuccess(city, url);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        let message = "Impossible de récupérer votre position";
        if (error.code === 1) message = "Permission de géolocalisation refusée";
        else if (error.code === 2) message = "Position non disponible";
        else if (error.code === 3) message = "Délai d'attente dépassé";
        
        if (onError) onError(message);
        else toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [updateCityFromCoords]);

  const extractCoordsFromUrl = useCallback((url: string) => {
    // Use safe, bounded regex to prevent ReDoS (bounded quantifiers)
    const regex1 = /@(-?\d{1,3}\.\d{1,15}),(-?\d{1,3}\.\d{1,15})/;
    const regex2 = /[?&]q=(-?\d{1,3}\.\d{1,15}),(-?\d{1,3}\.\d{1,15})/;
    const coordsMatch = regex1.exec(url) || regex2.exec(url);
    if (coordsMatch) {
      return {
        lat: Number.parseFloat(coordsMatch[1]),
        lon: Number.parseFloat(coordsMatch[2])
      };
    }
    return null;
  }, []);

  return {
    isLocating,
    getCurrentLocation,
    updateCityFromCoords,
    extractCoordsFromUrl
  };
}
