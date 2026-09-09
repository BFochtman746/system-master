from __future__ import annotations

import re

from extractor_provider import ExtractionRequest, validate_provider_output


class CautiousSemanticNarrativeExtractor:
    """A deterministic source-to-observation candidate.

    This provider is intentionally narrow. It demonstrates real extraction from
    authorized source text without consulting gold labels or case identifiers.
    Unsupported or weakly signaled structures are abstained rather than guessed.
    It is a calibration candidate, not canonical narrative authority.
    """

    provider_id = "CAUTIOUS-SEMANTIC-NARRATIVE-EXTRACTOR-v1"

    def extract(self, request: ExtractionRequest) -> dict:
        text = request.authorized_source_text
        low = text.lower()
        predictions: list[dict] = []
        predicted_spans: list[dict] = []

        def add(label: str, confidence: float, status: str = "ASSERTED") -> None:
            predictions.append({
                "label": label,
                "confidence": confidence,
                "status": status,
            })

        task = request.task

        if task == "ANCHOR_LOCALIZATION":
            match = re.search(
                r"\b(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,2})\s+"
                r"(sounded|rang|flashed|shattered|opened|closed|fell)\b",
                low,
            )
            if match:
                phrase = match.group(1)
                words = phrase.split()
                if len(words) > 2:
                    phrase = " ".join(words[-2:])
                phrase = phrase.removeprefix("the ").strip()
                start = low.find(phrase)
                anchor_id = phrase.replace(" ", "_")
                add(f"anchor:{anchor_id}", 0.88)
                predicted_spans.append({
                    "anchor_id": anchor_id,
                    "span": [start, start + len(phrase)],
                })

        elif task == "ENTITY_IDENTITY_COREFERENCE":
            match = re.match(r"([A-Z][a-z]+)\b", text)
            if match:
                name = match.group(1)
                add(f"entity:{name}", 0.90)
                for pronoun in ("she", "he", "they"):
                    if re.search(rf"\b{pronoun}\b", low):
                        add(f"coref:{pronoun}->{name}", 0.84)
                        break

        elif task == "EVENT_IDENTITY":
            same = re.search(r"\bthe same ([a-z]+)\b", low)
            separate = re.search(r"\bthe ([a-z]+) that followed was separate\b", low)
            if same:
                add(f"same_event:{same.group(1)}", 0.82)
            if separate:
                add(f"distinct_event:{separate.group(1)}", 0.82)

        elif task == "STORY_VS_DISCOURSE_TIME":
            unresolved = (
                re.search(r"\bbefore\b.*\bor\b.*\bafter\b", low)
                and any(cue in low for cue in ("which", "establish", "settles"))
            )
            if unresolved:
                add("time:relative_unresolved", 0.76, "UNRESOLVED")
            elif "returns to" in low or "return to" in low:
                add("story:past_before_present", 0.86)
                add("discourse:present_before_past", 0.86)

        elif task == "CAUSAL_GOAL_RELATIONS":
            match = re.search(
                r"\b([a-z]+(?:ies|s))\b[^.]*\bbecause\s+"
                r"(?:he|she|they)\s+wants?\s+to\s+([a-z]+)\s+(?:the\s+)?([a-z]+)",
                low,
            )
            if match:
                action = self._normalize_action(match.group(1))
                goal_verb = match.group(2)
                goal_object = match.group(3)
                add(f"goal:{action}_supports_{goal_verb}_{goal_object}", 0.86)

        elif task == "EPISTEMIC_FOCALIZATION":
            multi = re.search(
                r"enters\s+([A-Z][a-z]+)'s.*then\s+([A-Z][a-z]+)'s",
                text,
            )
            if multi and ("without settling" in low or "without declaring" in low):
                add(f"focalizes:{multi.group(1)}", 0.74, "ALTERNATIVE")
                add(f"focalizes:{multi.group(2)}", 0.74, "ALTERNATIVE")
            else:
                viewpoint = re.search(r"From\s+([A-Z][a-z]+)'s viewpoint", text)
                if viewpoint:
                    name = viewpoint.group(1)
                    add(f"focalizes:{name}", 0.90)
                    if "seems" in low or "appears" in low:
                        add(f"perceives:{name}", 0.82)
                    if re.search(r"\b(?:he|she|they)\s+believes?\b", low):
                        add(f"believes:{name}", 0.86)
                    explicit_knowledge = re.search(r"\b(?:he|she|they)\s+knows?\b", low)
                    denied_knowledge = re.search(r"\b(?:does|do|did)\s+not\s+know\b", low)
                    if explicit_knowledge and not denied_knowledge:
                        add(f"knows:{name}", 0.86)

        elif task == "NARRATIVE_FUNCTION":
            if "plants" in low and ("later" in low or "setup" in low):
                add("function:SETUP", 0.88)
            if "reveals" in low or "revealing" in low:
                add("function:CHARACTER_REVEAL", 0.84)

        elif task == "SETUP_PAYOFF_OPEN_QUESTION":
            repeated = re.search(
                r"\b(?:a|the)\s+(?:tiny\s+)?([a-z]+)\s+\w+[^.]*\.\s+"
                r"Much later,\s+the\s+\1\b",
                text,
                re.IGNORECASE,
            )
            if repeated:
                noun = repeated.group(1).lower()
                add(f"setup:{noun}", 0.82)
                add(f"payoff:{noun}", 0.82)
            if "remains unanswered" in low or "remains unexplained" in low:
                add("status:question=OPEN", 0.90)

        elif task == "ARC_ORCHESTRATION":
            if "story ends before" in low:
                add("arc:STATUS=UNRESOLVED", 0.78, "UNRESOLVED")
            elif (
                "at first" in low
                and "same" in low
                and "returns" in low
                and ("transforming" in low or "transforms" in low)
            ):
                add("motif:INTRODUCTION", 0.82)
                add("motif:TRANSFORMATION", 0.84)

        if not predictions:
            add(f"abstain:{task}", 0.0, "ABSTAIN")

        payload = {
            "case_id": request.case_id,
            "task": request.task,
            "provider_id": self.provider_id,
            "source_sha256": request.source_sha256,
            "predictions": predictions,
            "predicted_spans": predicted_spans,
            "canonical_state_write_authorized": False,
        }
        return validate_provider_output(request, payload)

    @staticmethod
    def _normalize_action(word: str) -> str:
        value = word.lower()
        if value.endswith("ies"):
            return value[:-3] + "y"
        if value.endswith("es") and len(value) > 4:
            return value[:-2]
        if value.endswith("s") and len(value) > 3:
            return value[:-1]
        return value
