import React, { useEffect, useState } from 'react';
import { baseClient } from '@/api/baseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LeaveReviewDialog({ booking, open, onClose, onSubmitted }) {
	const [rating, setRating] = useState(5);
	const [reviewText, setReviewText] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setRating(5);
			setReviewText('');
			setIsSubmitting(false);
		}
	}, [open, booking?.id]);

	const handleSubmit = async () => {
		if (!booking || !reviewText.trim()) {
			return;
		}

		setIsSubmitting(true);

		try {
			await baseClient.entities.Review.create({
				booking_id: booking.id,
				booking_reference: booking.booking_reference,
				guest_name: booking.customer_name,
				guest_email: booking.customer_email,
				package_name: booking.package_name,
				rating,
				review_text: reviewText.trim(),
			});
			toast.success('Your review is now visible in the resort review section.');
			if (onSubmitted) {
				onSubmitted();
				return;
			}
			onClose();
		} catch (error) {
			toast.error(error?.message || 'Unable to submit your review.');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Leave a Review</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<p className="text-sm font-medium text-foreground">{booking?.package_name}</p>
						<p className="text-sm text-muted-foreground">Share your experience with other guests.</p>
					</div>

					<div className="space-y-2">
						<p className="text-sm font-medium">Your Rating</p>
						<div className="flex gap-2">
							{[1, 2, 3, 4, 5].map((value) => (
								<button
									key={value}
									type="button"
									className="rounded-md p-1 transition-colors hover:bg-muted"
									onClick={() => setRating(value)}
								>
									<Star className={value <= rating ? 'h-6 w-6 fill-secondary text-secondary' : 'h-6 w-6 text-muted-foreground'} />
								</button>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-sm font-medium">Review</p>
						<Textarea
							value={reviewText}
							onChange={(event) => setReviewText(event.target.value)}
							placeholder="Tell us what you liked, what stood out, and how your stay went."
							rows={5}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
					<Button onClick={handleSubmit} disabled={isSubmitting || !reviewText.trim()}>
						{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						Submit Review
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
