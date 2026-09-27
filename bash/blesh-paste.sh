# blesh-paste.sh -- sourced AFTER ble.sh (and after the theme).
#
# Pasted input is never executed and never transformed:
#   * bracketed paste is spliced into the buffer verbatim (literal newlines),
#   * a newline that arrives glued to the text in front of it -- i.e. every
#     newline of an unbracketed paste, whether the terminal sends CR or LF --
#     inserts a newline instead of running the buffer, and nothing is executed
#     until the input stream has been quiet,
#   * no "decoding/processing input..." progress bar on large pastes.
#
# Nothing under /usr/share/blesh is modified; these are plain function
# overrides.  C-j stays bound to accept-line, completion/history and the vi/
# emacs keymaps are untouched.
#
# Upstream facts this file relies on (ble.sh 0.4.0):
#   ble.sh:3834  ble-decode/.hook/show-progress     -- the progress bar
#   ble.sh:3884  ble-decode/.hook                   -- every input byte enters here
#   ble.sh:9827  ble/widget/bracketed-paste.proc    -- bracketed paste insert
#   ble.sh:11193 ble/widget/accept-line             -- the ONLY path that runs code
#   ble.sh:11262 ble-edit/is-single-complete-line   -- RET decision predicate
#   ble.sh:11271 ble/widget/accept-single-line-or   -- used by vi_imap/vi-command
#   ble.sh:11278 ble/widget/accept-single-line-or-newline -- emacs RET / C-m
#   keymap/emacs.sh:108-111  C-j,C-RET -> accept-line; C-m,RET -> single-line-or
#   keymap/vi.sh:5713-5716,5845  vi C-j/C-RET/RET/C-m (vi_cmap/read do not run code)
#   ble-edit/content/is-single-line == "the buffer contains no \n", so upstream
#   RET turns "for ... do <RET>" into a newline and only C-j can run it.
#   ble/util/is-stdin-ready == `read -t 0`, i.e. "the tty still has bytes".

# ---------------------------------------------------------------------------
# 1. Kill the decode/processing progress bar.
#    ble-decode/.hook calls this every 100 bytes when >= 200 bytes are decoded.
#    (Previously a duplicate no-op inside ~/.bashrc; consolidated here.)
# ---------------------------------------------------------------------------
ble-decode/.hook/show-progress() { return 0; }

# ---------------------------------------------------------------------------
# 2. Bracketed paste: verbatim splice.
#    Upstream ble/widget/bracketed-paste.proc -> ble/widget/batch-insert, which
#    in overwrite mode falls back to per-char ble/widget/self-insert and would
#    *replace* existing text.  ble/widget/.insert-string is the raw splice used
#    by ble/widget/insert-string itself: no overwrite, no repetition arg, no
#    filtering.  CR / CRLF have already been normalised to LF by the paste hook
#    (13 is Enter in the terminal protocol and LF is what the edit buffer
#    stores), so the bytes land as literal newlines.
#
#    The accumulation itself is also replaced: upstream's
#    ble/widget/bracketed-paste.hook appends to a string with
#    `_ble_edit_bracketed_paste=$_ble_edit_bracketed_paste:$1` and then strips a
#    6-field suffix pattern from that growing string for every single byte, i.e.
#    O(n^2) per paste (measured on this box: 4KB -> 10s CPU, 16KB -> 120s CPU,
#    25KB -> several minutes of frozen editor, which is exactly the case the
#    progress bar used to paper over).  Collecting the bytes in an array and
#    normalising at the end is the same transformation in O(n).
# ---------------------------------------------------------------------------
_ble_paste_chars=()
function ble/widget/bracketed-paste {
  ble-edit/content/clear-arg
  _ble_edit_mark_active=
  _ble_paste_chars=()
  _ble_edit_bracketed_paste_proc=ble/widget/bracketed-paste.proc
  _ble_decode_char__hook=ble/widget/bracketed-paste.hook
  return 148
}
function ble/widget/bracketed-paste.hook {
  local char=$1
  _ble_paste_chars+=("$char")
  local n=${#_ble_paste_chars[@]} i=0
  # end marker: ESC [ 2 0 1 ~   (27 91 50 48 49 126)
  if ((n>=6)) &&
     [[ ${_ble_paste_chars[n-6]} == 27 && ${_ble_paste_chars[n-5]} == 91 &&
        ${_ble_paste_chars[n-4]} == 50 && ${_ble_paste_chars[n-3]} == 48 &&
        ${_ble_paste_chars[n-2]} == 49 && ${_ble_paste_chars[n-1]} == 126 ]]; then
    i=$((n-6))
  # end marker: CSI 2 0 1 ~   (155 50 48 49 126)
  elif ((n>=5)) &&
       [[ ${_ble_paste_chars[n-5]} == 155 && ${_ble_paste_chars[n-4]} == 50 &&
          ${_ble_paste_chars[n-3]} == 48 && ${_ble_paste_chars[n-2]} == 49 &&
          ${_ble_paste_chars[n-1]} == 126 ]]; then
    i=$((n-5))
  else
    _ble_decode_char__hook=ble/widget/bracketed-paste.hook
    return 148
  fi
  # normalise CRLF / CR -> LF, everything else goes through untouched
  local -a chars=()
  local j=0 c
  while ((j<i)); do
    c=${_ble_paste_chars[j]}
    if ((c==13)); then
      chars+=(10)
      ((j+1<i)) && [[ ${_ble_paste_chars[j+1]} == 10 ]] && ((j+=1))
    else
      chars+=("$c")
    fi
    ((j+=1))
  done
  _ble_paste_chars=()
  local proc=$_ble_edit_bracketed_paste_proc
  _ble_edit_bracketed_paste_proc=
  [[ $proc ]] && builtin eval -- "$proc \"\${chars[@]}\""
}
function ble/widget/bracketed-paste.proc {
  local -a KEYS; KEYS=("$@")
  local -a parts=()
  local char ret ins
  for char in "${KEYS[@]}"; do
    ble/util/c2s "$char"
    parts+=("$ret")
  done
  # NB: printf, not "${parts[*]}" -- IFS is still the default at expansion time.
  builtin printf -v ins '%s' "${parts[@]}"
  ble/widget/.insert-string "$ins"
}

# ---------------------------------------------------------------------------
# 3. Measure how long the input stream was idle before each byte.
#    ble-decode/.hook is the single entry point for input (readline calls it per
#    byte through its `bind -x` hooks).  The gap is measured from the moment the
#    *previous* byte finished decoding to the moment this one arrived, so it is
#    "how long did the user pause" and not "how long did ble take to redraw".
#    That is the only thing that can tell a real key press apart from the CR/LF
#    of a paste: a paste delivers its newline glued to the text in front of it
#    (gap ~0), a human presses Enter tens of ms after the last character.
# ---------------------------------------------------------------------------
_ble_paste_gap_ms=0   # idle time before the byte currently being decoded
_ble_paste_last_ms=0  # when the previous byte finished decoding
if [[ $_ble_util_clock_type == EPOCHREALTIME ]]; then
  if ! ble/is-function ble/paste#decode-hook.orig; then
    _ble_paste_def=$(declare -f ble-decode/.hook)
    _ble_paste_name=${_ble_paste_def%% *}
    ble/function#evaldef "function ble/paste#decode-hook.orig${_ble_paste_def#"$_ble_paste_name"}"
    unset -v _ble_paste_def _ble_paste_name
  fi
  function ble-decode/.hook {
    local _ble_paste_now=$EPOCHREALTIME
    local _ble_paste_frac=${_ble_paste_now#*.}000
    local _ble_paste_t=$(( (10#0${_ble_paste_now%%.*}-_ble_util_clock_base)*1000+10#0${_ble_paste_frac::3} ))
    ((_ble_paste_gap_ms=_ble_paste_t-_ble_paste_last_ms,_ble_paste_gap_ms<0)) && _ble_paste_gap_ms=0
    ble/paste#decode-hook.orig "$@"
    local _ble_paste_ext=$?
    _ble_paste_now=$EPOCHREALTIME
    _ble_paste_frac=${_ble_paste_now#*.}000
    _ble_paste_last_ms=$(( (10#0${_ble_paste_now%%.*}-_ble_util_clock_base)*1000+10#0${_ble_paste_frac::3} ))
    return "$_ble_paste_ext"
  }
fi

# ---------------------------------------------------------------------------
# 4. Input-stream timing helpers.
#    _ble_paste_burst_ms : gap below which the current byte counts as part of an
#      input burst (paste) instead of a key stroke.
#    _ble_paste_silence_ms : how long the stream must have been quiet before a
#      line may run.  The quiet already elapsed before the key counts towards
#      it, so a human who pauses before pressing Enter gets no extra latency.
#    _ble_paste_cap_ms : hard cap, a widget must never stall the editor.
# ---------------------------------------------------------------------------
_ble_paste_burst_ms=25
_ble_paste_silence_ms=50
_ble_paste_cap_ms=200
_ble_paste_step_ms=5
function ble/paste#is-burst-input {
  ((${_ble_paste_gap_ms:-0}<_ble_paste_burst_ms))
}
function ble/paste#wait-silence {
  local quiet=${_ble_paste_gap_ms:-0}
  ((quiet<0)) && quiet=0
  local elapsed=0
  while ((quiet<_ble_paste_silence_ms&&elapsed<_ble_paste_cap_ms)); do
    # input still pending: this newline is not the end of the burst, the caller
    # re-checks the predicate and refuses to accept.
    ble-decode/has-input && return 0
    ble/util/msleep "$_ble_paste_step_ms"
    ((++elapsed,quiet+=_ble_paste_step_ms))
  done
  return 0
}

# ---------------------------------------------------------------------------
# 5. "Is the whole buffer ready to run?"
#    Upstream ble-edit/is-single-complete-line (ble.sh:11262) demands
#    ble-edit/content/is-single-line, so a finished multi-line construct
#    (for ... do / echo / done) can never be accepted by RET -- upstream needs
#    C-j for that.  We drop the single-line rule and ask the bash parser
#    instead, which is the same question ble/widget/accept-line asks when it is
#    called with the `syntax` argument: ready when the buffer is syntactically
#    complete and nothing is pending.  Pending input still refuses, which is
#    what stops an in-flight paste from being executed.
# ---------------------------------------------------------------------------
function ble-edit/is-single-complete-line {
  [[ $_ble_edit_str ]] && ble-decode/has-input && return 1
  ble-edit/content/update-syntax
  ble/syntax:bash/is-complete
}

# ---------------------------------------------------------------------------
# 6. The single execution gate.
#    Every widget that can run the buffer funnels through ble/widget/accept-line
#    -- emacs C-j/C-RET/RET/C-m, vi C-j/C-RET/RET/C-m, C-o, and (importantly)
#    the LF an unbracketed paste delivers for a newline, because LF == C-j is
#    bound straight to accept-line upstream and never consults the RET widgets.
#    The original body is preserved under a private name.
# ---------------------------------------------------------------------------
if ble/is-function ble/widget/accept-line &&
   ! ble/is-function ble/paste#accept-line.orig; then
  _ble_paste_def=$(declare -f ble/widget/accept-line)
  _ble_paste_name=${_ble_paste_def%% *}
  ble/function#evaldef "function ble/paste#accept-line.orig${_ble_paste_def#"$_ble_paste_name"}"
  unset -v _ble_paste_def _ble_paste_name
fi
function ble/widget/accept-line {
  # The newline of a paste is glued to the text in front of it -> never run it.
  if ble/paste#is-burst-input; then
    ble/widget/newline
    return 0
  fi
  # Wait for the stream to go quiet, then re-decide: this catches the case where
  # the newline was the last byte read so far and the rest of the paste is still
  # on its way.
  ble/paste#wait-silence
  if ! ble-edit/is-single-complete-line; then
    ble/widget/newline
    return 0
  fi
  ble/paste#accept-line.orig "$@"
}

# ---------------------------------------------------------------------------
# 7. RET / C-m widgets: emacs RET+C-m, plus the helper the vi keymaps share.
#    Same decision as upstream, but the predicate above is the multi-line aware
#    one and every accept goes through the gate in section 6.
# ---------------------------------------------------------------------------
function ble/widget/accept-single-line-or-newline {
  if ble-edit/is-single-complete-line; then
    ble/widget/accept-line
  else
    ble/widget/newline
  fi
}
function ble/widget/accept-single-line-or {
  if ble-edit/is-single-complete-line; then
    ble/widget/accept-line
  else
    ble/widget/"$@"
  fi
}
