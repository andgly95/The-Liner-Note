"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Users, UserPlus, X, ChevronDown, ChevronUp, Eye } from "lucide-react";

interface UserSwitcherProps {
  currentUser: string;
  viewingUser: string | null;
  onUserSelect: (username: string | null) => void;
}

const FRIENDS_STORAGE_KEY = "liner-note-friends";

export function UserSwitcher({ currentUser, viewingUser, onUserSelect }: UserSwitcherProps) {
  const [friends, setFriends] = useState<string[]>([]);
  const [newFriend, setNewFriend] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load friends from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(FRIENDS_STORAGE_KEY);
    if (stored) {
      try {
        setFriends(JSON.parse(stored));
      } catch {
        console.error("Failed to parse friends from localStorage");
      }
    }
  }, []);

  // Save friends to localStorage when changed
  useEffect(() => {
    localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify(friends));
  }, [friends]);

  const addFriend = () => {
    const username = newFriend.trim();
    if (!username) {
      setError("Please enter a username");
      return;
    }
    if (username.toLowerCase() === currentUser.toLowerCase()) {
      setError("That's you!");
      return;
    }
    if (friends.some(f => f.toLowerCase() === username.toLowerCase())) {
      setError("Already in your friends list");
      return;
    }
    setFriends([...friends, username]);
    setNewFriend("");
    setError(null);
  };

  const removeFriend = (username: string) => {
    setFriends(friends.filter(f => f !== username));
    if (viewingUser === username) {
      onUserSelect(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addFriend();
    }
  };

  const isViewingOther = viewingUser && viewingUser !== currentUser;

  return (
    <Card className={isViewingOther ? "border-blue-500 border-2" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <CardTitle className="text-lg">
              {isViewingOther ? (
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-500" />
                  Viewing: {viewingUser}
                </span>
              ) : (
                "Your Collection"
              )}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
        {isViewingOther && (
          <CardDescription>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-muted-foreground"
              onClick={() => onUserSelect(null)}
            >
              ← Back to your collection
            </Button>
          </CardDescription>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />

          {/* Add Friend Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Enter Discogs username..."
              value={newFriend}
              onChange={(e) => {
                setNewFriend(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={addFriend}>
              <UserPlus className="w-4 h-4" />
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}

          {/* Friends List */}
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add friends to view their collections
            </p>
          ) : (
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div
                    key={friend}
                    className={`flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer group ${
                      viewingUser === friend ? "bg-accent" : ""
                    }`}
                  >
                    <button
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => onUserSelect(friend)}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          {friend[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{friend}</span>
                      {viewingUser === friend && (
                        <Eye className="w-3 h-3 text-blue-500" />
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFriend(friend);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Back to own collection button */}
          {isViewingOther && (
            <>
              <Separator className="my-4" />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onUserSelect(null)}
              >
                View My Collection
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
