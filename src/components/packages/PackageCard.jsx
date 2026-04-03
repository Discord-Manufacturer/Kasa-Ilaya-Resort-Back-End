import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';

const tourLabels = {
	day_tour: 'Day Tour',
	night_tour: 'Night Tour',
	'22_hours': '22 Hours',
};

const getTourPrice = (pkg, tourType) => {
	if (tourType === 'day_tour') {
		return Number(pkg.day_tour_price ?? pkg.price ?? 0);
	}

	if (tourType === 'night_tour') {
		return Number(pkg.night_tour_price ?? pkg.price ?? 0);
	}

	if (tourType === '22_hours') {
		return Number(pkg.twenty_two_hour_price ?? pkg.price ?? 0);
	}

	return Number(pkg.price ?? 0);
};

export default function PackageCard({ pkg, index = 0, liveAvailability, selectedTour }) {
	const { isAuthenticated } = useAuth();
	const galleryImages = Array.isArray(pkg.gallery_images) && pkg.gallery_images.length > 0
		? pkg.gallery_images
		: [pkg.image_url || '/img/room_Resort%20View.jpg'];
	const [activeImageIndex, setActiveImageIndex] = useState(0);
	const bookedToday = liveAvailability?.bookedToday || 0;
	const maxSlots = liveAvailability?.maxSlots || 1;
	const remainingToday = Math.max(0, maxSlots - bookedToday);
	const isFullyBookedToday = remainingToday === 0;
	const hasMultipleImages = galleryImages.length > 1;
	const dayTourPrice = getTourPrice(pkg, 'day_tour');
	const nightTourPrice = getTourPrice(pkg, 'night_tour');
	const twentyTwoHourPrice = getTourPrice(pkg, '22_hours');
	const heroPrice = selectedTour ? getTourPrice(pkg, selectedTour) : Math.min(dayTourPrice, nightTourPrice, twentyTwoHourPrice);
	const bookingPageUrl = `${createPageUrl('BookingForm')}?packageId=${pkg.id}`;
	const loginToBookingUrl = `${createPageUrl('Login')}?next=${encodeURIComponent(bookingPageUrl)}`;

	useEffect(() => {
		setActiveImageIndex(0);
	}, [pkg.id, galleryImages.length]);

	useEffect(() => {
		if (!hasMultipleImages) {
			return undefined;
		}

		const intervalId = window.setInterval(() => {
			setActiveImageIndex((current) => (current + 1) % galleryImages.length);
		}, 4000);

		return () => window.clearInterval(intervalId);
	}, [galleryImages.length, hasMultipleImages]);

	const goToPrevious = () => {
		setActiveImageIndex((current) => (current - 1 + galleryImages.length) % galleryImages.length);
	};

	const goToNext = () => {
		setActiveImageIndex((current) => (current + 1) % galleryImages.length);
	};

	return (
		<Card className="group overflow-hidden border-border/70 bg-card/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ animationDelay: `${index * 80}ms` }}>
			<div className="relative h-56 overflow-hidden">
				<div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}>
					{galleryImages.map((imageUrl, imageIndex) => (
						<img key={`${pkg.id}-${imageUrl}-${imageIndex}`} src={imageUrl} alt={`${pkg.name} ${imageIndex + 1}`} className="h-full min-w-full object-cover transition-transform duration-500 group-hover:scale-105" />
					))}
				</div>
				<div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
				<div className="absolute left-4 top-4 flex items-center gap-2">
					<Badge className="bg-white/90 text-slate-900 hover:bg-white">{selectedTour ? tourLabels[selectedTour] : 'All Tour Options'}</Badge>
					<Badge className="bg-secondary text-secondary-foreground">₱{heroPrice.toLocaleString()}</Badge>
				</div>
				{hasMultipleImages ? (
					<>
						<div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
							{galleryImages.map((imageUrl, dotIndex) => (
								<button
									key={`${imageUrl}-dot-${dotIndex}`}
									type="button"
									onClick={() => setActiveImageIndex(dotIndex)}
									className={`h-2.5 rounded-full transition-all ${dotIndex === activeImageIndex ? 'w-6 bg-white' : 'w-2.5 bg-white/55'}`}
									aria-label={`View image ${dotIndex + 1} for ${pkg.name}`}
								/>
							))}
						</div>
						<div className="absolute inset-y-0 left-3 flex items-center">
							<button type="button" onClick={goToPrevious} className="rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-black/55" aria-label={`Previous image for ${pkg.name}`}>
								<ChevronLeft className="h-4 w-4" />
							</button>
						</div>
						<div className="absolute inset-y-0 right-3 flex items-center">
							<button type="button" onClick={goToNext} className="rounded-full bg-black/35 p-2 text-white backdrop-blur-sm transition hover:bg-black/55" aria-label={`Next image for ${pkg.name}`}>
								<ChevronRight className="h-4 w-4" />
							</button>
						</div>
					</>
				) : null}
			</div>

			<CardContent className="space-y-4 p-6">
				<div>
					<h2 className="font-display text-2xl font-bold text-foreground">{pkg.name}</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">{pkg.description || 'A curated resort experience designed for memorable stays and events.'}</p>
					<div
						className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium leading-none ${
							isFullyBookedToday
								? 'border-destructive/30 bg-destructive/10 text-destructive'
								: 'border-primary/20 bg-primary/10 text-primary'
						}`}
					>
						{isFullyBookedToday ? 'Live availability: Reserved today' : 'Live availability: Available today'}
					</div>
				</div>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Users className="h-4 w-4 text-primary" />
					<span>Up to {pkg.max_guests || 10} guests</span>
				</div>

				<div className="grid grid-cols-3 gap-2 text-center text-xs">
					<div className={`rounded-xl border px-2 py-2 ${selectedTour === 'day_tour' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/40 text-muted-foreground'}`}>
						<div className="font-medium">Day</div>
						<div className="mt-1 text-sm font-semibold text-foreground">₱{dayTourPrice.toLocaleString()}</div>
					</div>
					<div className={`rounded-xl border px-2 py-2 ${selectedTour === 'night_tour' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/40 text-muted-foreground'}`}>
						<div className="font-medium">Night</div>
						<div className="mt-1 text-sm font-semibold text-foreground">₱{nightTourPrice.toLocaleString()}</div>
					</div>
					<div className={`rounded-xl border px-2 py-2 ${selectedTour === '22_hours' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/40 text-muted-foreground'}`}>
						<div className="font-medium">22 Hrs</div>
						<div className="mt-1 text-sm font-semibold text-foreground">₱{twentyTwoHourPrice.toLocaleString()}</div>
					</div>
				</div>

				{Array.isArray(pkg.inclusions) && pkg.inclusions.length > 0 ? (
					<div className="space-y-2">
						{pkg.inclusions.slice(0, 4).map((item) => (
							<div key={item} className="flex items-start gap-2 text-sm text-foreground/85">
								<Check className="mt-0.5 h-4 w-4 text-primary" />
								<span>{item}</span>
							</div>
						))}
					</div>
				) : null}

				<Button asChild className="w-full gap-2">
					<Link to={isAuthenticated ? bookingPageUrl : loginToBookingUrl}>
						Book This Package
						<ArrowRight className="h-4 w-4" />
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
