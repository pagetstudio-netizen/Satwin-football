import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Headphones, MessageCircle, Users } from "lucide-react";

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  supportLink: string;
  channelLink: string;
  groupLink: string;
}

export default function ServiceModal({ open, onClose, supportLink, channelLink, groupLink }: ServiceModalProps) {
  const openLink = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Service client</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Button
            variant="secondary"
            className="w-full flex items-center justify-start gap-3 h-auto py-4"
            onClick={() => openLink(supportLink)}
            data-testid="button-support"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground">Service client</p>
              <p className="text-xs text-muted-foreground">Assistance en direct</p>
            </div>
          </Button>

          <Button
            variant="secondary"
            className="w-full flex items-center justify-start gap-3 h-auto py-4"
            onClick={() => openLink(channelLink)}
            data-testid="button-channel"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground">Chaîne officielle</p>
              <p className="text-xs text-muted-foreground">Annonces et actualités</p>
            </div>
          </Button>

          <Button
            variant="secondary"
            className="w-full flex items-center justify-start gap-3 h-auto py-4"
            onClick={() => openLink(groupLink)}
            data-testid="button-group"
          >
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground">Groupe de discussion</p>
              <p className="text-xs text-muted-foreground">Échangez avec la communauté</p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
